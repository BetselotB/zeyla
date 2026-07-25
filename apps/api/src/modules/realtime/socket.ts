import type { Server as HttpServer } from "node:http";
import { REALTIME_EVENTS } from "@zeyla/shared";
import { Server, type Socket } from "socket.io";
import { env } from "../../config/env.js";
import { isUuid } from "../marketplace/lib/actor.js";
import {
  contractRoom,
  providerRoom,
  roomSize,
  setIo,
  userRoom,
} from "./io.js";
import { getContractParties, isContractMember } from "./membership.js";
import { setProviderPresence } from "./presence.service.js";

interface SocketIdentity {
  userId: string;
  role: "user" | "provider";
}

/**
 * Realtime transport.
 *
 * Rooms are joined server-side from the handshake identity, never from a
 * client-supplied room name, so a socket cannot listen in on someone else's
 * pings by guessing a user id. Contract rooms are checked against the contract
 * parties before the join is allowed.
 *
 * TEMPORARY: identity comes from `handshake.auth` for the same reason the REST
 * side reads `x-user-id` — Supabase JWT verification is not wired yet. Verify
 * the token here when the auth module lands; no client-side change is needed
 * beyond sending the token instead of the id.
 */
export function attachRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { userId?: string; role?: string };
    if (!isUuid(auth?.userId)) {
      next(new Error("unauthenticated"));
      return;
    }
    const identity: SocketIdentity = {
      userId: auth.userId,
      role: auth.role === "provider" ? "provider" : "user",
    };
    socket.data.identity = identity;
    next();
  });

  io.on("connection", (socket) => {
    const identity = socket.data.identity as SocketIdentity;

    socket.join(userRoom(identity.userId));
    if (identity.role === "provider") {
      socket.join(providerRoom(identity.userId));
      void setProviderPresence(identity.userId, true);
    }

    socket.on(REALTIME_EVENTS.JOIN_CONTRACT, (payload: unknown) => {
      void joinContract(socket, identity, payload);
    });

    socket.on(REALTIME_EVENTS.LEAVE_CONTRACT, (payload: unknown) => {
      const contractId = readContractId(payload);
      if (contractId) socket.leave(contractRoom(contractId));
    });

    socket.on(REALTIME_EVENTS.PROVIDER_PRESENCE, (payload: unknown) => {
      if (identity.role !== "provider") return;
      const isOnline = Boolean((payload as { isOnline?: boolean })?.isOnline);
      void setProviderPresence(identity.userId, isOnline);
    });

    socket.on("disconnect", () => {
      if (identity.role !== "provider") return;
      // Other tabs may still be connected — only go offline on the last one.
      void roomSize(providerRoom(identity.userId)).then((remaining) => {
        if (remaining === 0) void setProviderPresence(identity.userId, false);
      });
    });
  });

  setIo(io);
  return io;
}

function readContractId(payload: unknown): string | null {
  if (typeof payload === "string") return isUuid(payload) ? payload : null;
  const id = (payload as { contractId?: unknown })?.contractId;
  return isUuid(id) ? id : null;
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
