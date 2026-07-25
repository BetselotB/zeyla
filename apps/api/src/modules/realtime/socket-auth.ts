import type { Socket } from "socket.io";
import { findUserByAuthUid, findUserById } from "../auth/repo.js";
import { resolveSession } from "../auth/sessions.js";
import { isSupabaseConfigured, verifySupabaseToken } from "../auth/supabase.js";

/**
 * Handshake authentication for the socket server.
 *
 * Accepts exactly the same two token flavours as the REST `requireAuth`
 * middleware — a Supabase access token or an opaque mock-OTP session token — so
 * a client holds one credential for both transports. That middleware is Express
 * -shaped and cannot run on a handshake, and the resolver behind it is private
 * to the auth module, so the lookup is repeated here rather than reimplemented
 * differently. If auth ever exports its `resolveUser`, delete this and call it.
 */
export interface SocketIdentity {
  userId: string;
  role: "user" | "provider";
}

type Handshake = Socket["handshake"];

function readHandshakeToken(handshake: Handshake): string | null {
  const auth = handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === "string" && auth.token.trim()) {
    return auth.token.trim();
  }

  // Browsers cannot set headers on a websocket, but the polling transport and
  // every non-browser client can, so accept the standard header too.
  const header = handshake.headers.authorization;
  if (typeof header === "string") {
    const [scheme, token] = header.split(" ");
    if (token && scheme?.toLowerCase() === "bearer") return token.trim() || null;
  }
  return null;
}

function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

export async function identifySocket(
  handshake: Handshake,
): Promise<SocketIdentity | null> {
  const token = readHandshakeToken(handshake);
  if (!token) return null;

  if (isSupabaseConfigured() && looksLikeJwt(token)) {
    const identity = await verifySupabaseToken(token);
    if (identity) {
      const byUid = await findUserByAuthUid(identity.uid);
      // The role decides which rooms this socket may join, so it comes from the
      // users row and never from the handshake payload.
      if (byUid) return { userId: byUid.id, role: byUid.role };
    }
  }

  const userId = await resolveSession(token);
  if (!userId) return null;

  const user = await findUserById(userId);
  return user ? { userId: user.id, role: user.role } : null;
}
