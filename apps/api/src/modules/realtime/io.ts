import type { Server } from "socket.io";

/**
 * Registry so HTTP handlers can push into socket rooms without importing the
 * server construction (which would make marketplace depend on index.ts boot
 * order). socket.ts calls setIo() once at startup.
 *
 * Rooms:
 *   user:{userId}         every socket that authenticated as this user
 *   provider:{providerId} sockets whose user is acting as a provider
 *   contract:{contractId} the customer + provider pair on one live job
 */
let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const providerRoom = (providerId: string) => `provider:${providerId}`;
export const contractRoom = (contractId: string) => `contract:${contractId}`;

/**
 * Fire-and-forget emit. A dropped realtime frame must never fail the HTTP
 * request that triggered it — the same data is always readable over REST.
 */
function emit(room: string, event: string, payload: unknown) {
  if (!io) {
    console.warn(`[realtime] no socket server yet, dropped ${event} -> ${room}`);
    return false;
  }
  io.to(room).emit(event, payload);
  return true;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  return emit(userRoom(userId), event, payload);
}

export function emitToProvider(providerId: string, event: string, payload: unknown) {
  return emit(providerRoom(providerId), event, payload);
}

export function emitToContract(contractId: string, event: string, payload: unknown) {
  return emit(contractRoom(contractId), event, payload);
}

/**
 * One emit to several rooms. Socket.io unions the rooms, so a socket sitting in
 * two of them still receives the event exactly once — which is the whole point
 * when the customer is both a contract-room member and a user-room member.
 */
export function emitToRooms(rooms: string[], event: string, payload: unknown) {
  if (!io) {
    console.warn(`[realtime] no socket server yet, dropped ${event}`);
    return false;
  }
  io.to(rooms).emit(event, payload);
  return true;
}

/** How many sockets are currently in a room — used by /realtime/status. */
export async function roomSize(room: string): Promise<number> {
  if (!io) return 0;
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}
