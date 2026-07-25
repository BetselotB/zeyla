import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../../config/env.js";

/**
 * Realtime — Socket.io (+ Redis adapter in production).
 * - Ping notifications
 * - Live map: provider emits {lat,lng} every 5–10s while contract=active
 * - Cache in Redis key geo:contract:{id} with short TTL
 */
export function attachRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.on("connection", (socket) => {
    socket.on("join:contract", (contractId: string) => {
      socket.join(`contract:${contractId}`);
    });

    socket.on(
      "provider:location",
      (payload: { contractId: string; lat: number; lng: number }) => {
        // TODO: redis.set(contractGeoKey(id), JSON, 'EX', 30)
        socket
          .to(`contract:${payload.contractId}`)
          .emit("contract:location", payload);
      },
    );

    socket.on("ping:notify", (payload: { providerId: string; requestId: string }) => {
      io.to(`provider:${payload.providerId}`).emit("ping:incoming", payload);
    });
  });

  return io;
}
