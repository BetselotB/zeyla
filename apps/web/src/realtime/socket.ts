import type { Socket } from "socket.io-client";
import { getAccessToken } from "../auth/session";

/**
 * One authenticated socket per tab.
 *
 * The server rejects an unauthenticated handshake outright and derives every
 * room from the verified token, so a connection without a bearer is not a
 * degraded connection — it is no connection at all. Sharing a single socket
 * also means a page that watches both a job's location and its payment status
 * opens one connection rather than racing two.
 *
 * Connections are intentionally not reference-counted: the socket lives for as
 * long as the tab does, and hooks add and remove their own listeners.
 */

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let cached: Promise<Socket | null> | null = null;

async function connect(): Promise<Socket | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const { io } = await import("socket.io-client");
  return io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
  });
}

/** Resolves to null when nobody is signed in, so callers fall back gracefully. */
export function getSocket(): Promise<Socket | null> {
  if (!cached) cached = connect();
  return cached;
}

/** Drops the shared connection. Call on sign-out so the next user re-handshakes. */
export function closeSocket(): void {
  const pending = cached;
  cached = null;
  void pending?.then((socket) => socket?.disconnect()).catch(() => undefined);
}
