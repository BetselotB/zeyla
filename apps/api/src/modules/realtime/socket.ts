import type { Server as HttpServer } from "node:http";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { env } from "../../config/env.js";
import { isUuid } from "../marketplace/lib/actor.js";
import { ApiError } from "../marketplace/lib/errors.js";
import { latSchema, lngSchema } from "../marketplace/schemas.js";
import { contractRoom, providerRoom, setIo, userRoom } from "./io.js";
import { recordLocation } from "./location.service.js";
import { getContractParties, isContractMember } from "./membership.js";
import {
  setProviderPresence,
  touchProviderPresence,
} from "./presence.service.js";
import { identifySocket, type SocketIdentity } from "./socket-auth.js";
import { startContractEventBridge } from "./contract-events.js";

const locationEventSchema = z.object({
  contractId: z.string().uuid(),
  lat: latSchema,
  lng: lngSchema,
  headingDegrees: z.coerce.number().min(0).max(360).nullish(),
  speedMps: z.coerce.number().min(0).max(120).nullish(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).nullish(),
});

/**
 * Realtime transport.
 *
 * Identity comes from the same bearer token the REST side uses, verified on the
 * handshake (see ./socket-auth.ts). Rooms are then joined server-side from that
 * verified identity, never from a client-supplied room name, so a socket cannot
 * listen in on someone else's pings by guessing a user id. Contract rooms are
 * additionally checked against the contract parties before the join is allowed.
 */
export function attachRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.use((socket, next) => {
    identifySocket(socket.handshake)
      .then((identity) => {
        if (!identity) {
          next(new Error("unauthenticated"));
          return;
        }
        socket.data.identity = identity;
        next();
      })
      .catch(() => next(new Error("auth_unavailable")));
  });

  io.on("connection", (socket) => {
    const identity = socket.data.identity as SocketIdentity;

    socket.join(userRoom(identity.userId));
    if (identity.role === "provider") {
      socket.join(providerRoom(identity.userId));
      // Connecting proves the app is open, nothing more. Whether this provider
      // is discoverable is the availability status they set, which survives
      // both this connection and its loss.
      void touchProviderPresence(identity.userId);
    }

    socket.on(REALTIME_EVENTS.JOIN_CONTRACT, (payload: unknown) => {
      void joinContract(socket, identity, payload);
    });

    socket.on(REALTIME_EVENTS.LEAVE_CONTRACT, (payload: unknown) => {
      const contractId = readContractId(payload);
      if (contractId) socket.leave(contractRoom(contractId));
    });

    socket.on(REALTIME_EVENTS.PROVIDER_LOCATION, (payload: unknown) => {
      void pushLocation(socket, identity, payload);
    });

    socket.on(REALTIME_EVENTS.PROVIDER_PRESENCE, (payload: unknown) => {
      if (identity.role !== "provider") return;
      const isOnline = Boolean((payload as { isOnline?: boolean })?.isOnline);
      void setProviderPresence(identity.userId, isOnline);
    });

    socket.on("disconnect", () => {
      if (identity.role !== "provider") return;
      // Deliberately does not end the shift. A provider who tunnels into a lift
      // has not gone off duty, and a customer pinging them a minute later is
      // the behaviour they signed up for by staying online. `last_seen_at` is
      // what tells anyone how long ago the app was last heard from.
      void touchProviderPresence(identity.userId);
    });
  });

  setIo(io);
  // Escrow announces contract transitions on Redis rather than calling this
  // module directly, so the bridge only makes sense once `io` can deliver.
  startContractEventBridge();
  return io;
}

function readContractId(payload: unknown): string | null {
  if (typeof payload === "string") return isUuid(payload) ? payload : null;
  const id = (payload as { contractId?: unknown })?.contractId;
  return isUuid(id) ? id : null;
}

/**
 * A GPS tick arrives every 5–10s per active contract. A bad frame is answered
 * with realtime:error and dropped — never enough to kill the socket, because
 * that would end the customer's live map.
 */
async function pushLocation(
  socket: Socket,
  identity: SocketIdentity,
  payload: unknown,
) {
  const parsed = locationEventSchema.safeParse(payload);
  if (!parsed.success) {
    socket.emit(REALTIME_EVENTS.REALTIME_ERROR, {
      event: REALTIME_EVENTS.PROVIDER_LOCATION,
      message: "invalid_location",
    });
    return;
  }

  try {
    await recordLocation(identity.userId, parsed.data);
  } catch (err) {
    socket.emit(REALTIME_EVENTS.REALTIME_ERROR, {
      event: REALTIME_EVENTS.PROVIDER_LOCATION,
      message: err instanceof ApiError ? err.message : "location_rejected",
    });
  }
}

async function joinContract(
  socket: Socket,
  identity: SocketIdentity,
  payload: unknown,
) {
  const contractId = readContractId(payload);
  if (!contractId) {
    socket.emit(REALTIME_EVENTS.REALTIME_ERROR, {
      event: REALTIME_EVENTS.JOIN_CONTRACT,
      message: "invalid_contract_id",
    });
    return;
  }

  const parties = await getContractParties(contractId);
  if (!parties || !isContractMember(parties, identity.userId)) {
    socket.emit(REALTIME_EVENTS.REALTIME_ERROR, {
      event: REALTIME_EVENTS.JOIN_CONTRACT,
      message: "contract_not_found",
    });
    return;
  }

  await socket.join(contractRoom(contractId));
}
