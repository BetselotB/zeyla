import type { AuthProvider, AuthUser } from "@zeyla/shared";
import { query } from "../../db/client.js";

/** Shape of the `users` row this module reads and writes. */
export interface UserRow {
  id: string;
  /** Null for accounts created with email/password or Google — see 005. */
  phone: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  auth_provider: AuthProvider | null;
  role: "user" | "provider";
  id_doc_url: string | null;
  selfie_url: string | null;
  kyc_status: "pending" | "verified" | "manual_review" | "rejected";
  kyc_submitted_at: Date | null;
  kyc_reviewed_at: Date | null;
  kyc_note: string | null;
  onboarding_completed_at: Date | null;
  auth_uid: string | null;
  created_at: Date;
}

const USER_COLUMNS = `
  id, phone, name, email, avatar_url, auth_provider, role, id_doc_url,
  selfie_url, kyc_status, kyc_submitted_at, kyc_reviewed_at, kyc_note,
  onboarding_completed_at, auth_uid, created_at
`;

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    authProvider: row.auth_provider,
    role: row.role,
    kycStatus: row.kyc_status,
    kycSubmittedAt: row.kyc_submitted_at?.toISOString() ?? null,
    kycReviewedAt: row.kyc_reviewed_at?.toISOString() ?? null,
    onboardingCompleted: row.onboarding_completed_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findUserByPhone(phone: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE phone = $1`,
    [phone],
  );
  return rows[0] ?? null;
}

export async function findUserByAuthUid(uid: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE auth_uid = $1`,
    [uid],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * Idempotent by phone so a retried OTP verify never creates a duplicate
 * account. Also (re)links the Supabase uid when one is supplied.
 */
export async function upsertUserByPhone(
  phone: string,
  authUid: string | null,
): Promise<{ user: UserRow; created: boolean }> {
  const { rows } = await query<UserRow & { inserted: boolean }>(
    `INSERT INTO users (phone, auth_uid, auth_provider)
     VALUES ($1, $2, 'phone')
     ON CONFLICT (phone) DO UPDATE
       SET auth_uid = COALESCE(EXCLUDED.auth_uid, users.auth_uid),
           updated_at = now()
     RETURNING ${USER_COLUMNS}, (xmax = 0) AS inserted`,
    [phone, authUid],
  );

  const row = rows[0];
  if (!row) throw new Error("failed_to_upsert_user");
  return { user: row, created: row.inserted };
}

/** A verified Supabase account, as this module needs it. See supabase.ts. */
export interface AuthIdentity {
  uid: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: AuthProvider | null;
}

/**
 * Fills in blanks and links the Supabase uid, without ever overwriting
 * something the user set inside Zeyla with what the identity provider guessed.
 * Email and phone are only adopted when no other account holds them, so
 * linking can never fail on a unique index.
 */
async function linkIdentity(
  userId: string,
  identity: AuthIdentity,
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `UPDATE users
        SET auth_uid = COALESCE(auth_uid, $2),
            name = COALESCE(name, $3),
            avatar_url = COALESCE(avatar_url, $4),
            auth_provider = COALESCE(auth_provider, $5),
            email = COALESCE(
              email,
              (SELECT $6::text WHERE NOT EXISTS (
                 SELECT 1 FROM users o WHERE lower(o.email) = lower($6::text)
               ))
            ),
            phone = COALESCE(
              phone,
              (SELECT $7::text WHERE NOT EXISTS (
                 SELECT 1 FROM users o WHERE o.phone = $7::text
               ))
            ),
            updated_at = now()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [
      userId,
      identity.uid,
      identity.name,
      identity.avatarUrl,
      identity.provider,
      identity.email,
      identity.phone,
    ],
  );
  return rows[0] ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
  );
}

/**
 * Resolves a verified Supabase identity to exactly one Zeyla account.
 *
 * Supabase issues a separate uid per identity, so signing up with a password
 * and later using Google on the same address would otherwise produce two
 * accounts, two trust scores and two escrow histories. Matching on email (then
 * phone) before inserting keeps that to one row.
 */
export async function upsertUserByAuthIdentity(
  identity: AuthIdentity,
  attempt = 0,
): Promise<{ user: UserRow; created: boolean }> {
  const linked = await findUserByAuthUid(identity.uid);
  if (linked) {
    const refreshed = await linkIdentity(linked.id, identity);
    return { user: refreshed ?? linked, created: false };
  }

  const sameHuman =
    (identity.email ? await findUserByEmail(identity.email) : null) ??
    (identity.phone ? await findUserByPhone(identity.phone) : null);

  if (sameHuman) {
    const merged = await linkIdentity(sameHuman.id, identity);
    return { user: merged ?? sameHuman, created: false };
  }

  try {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (auth_uid, email, phone, name, avatar_url, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_COLUMNS}`,
      [
        identity.uid,
        identity.email,
        identity.phone,
        identity.name,
        identity.avatarUrl,
        identity.provider,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("failed_to_create_user");
    return { user: row, created: true };
  } catch (err) {
    // Two tabs finishing the same OAuth redirect at once. One insert wins; the
    // loser re-reads instead of surfacing a constraint error to the browser.
    if (isUniqueViolation(err) && attempt === 0) {
      return upsertUserByAuthIdentity(identity, attempt + 1);
    }
    throw err;
  }
}

/**
 * Marks the signup flow finished. Idempotent, and never moves the timestamp
 * forward on a user who replays the last step.
 */
export async function completeOnboarding(
  userId: string,
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `UPDATE users
        SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
            updated_at = now()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; email?: string; role?: "user" | "provider" },
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `UPDATE users
        SET name = COALESCE($2, name),
            email = COALESCE($3, email),
            role = COALESCE($4, role),
            updated_at = now()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [userId, patch.name ?? null, patch.email ?? null, patch.role ?? null],
  );
  return rows[0] ?? null;
}

export async function saveKycUpload(
  userId: string,
  input: {
    idDocUrl: string;
    selfieUrl: string;
    status: "manual_review" | "verified";
    note: string;
  },
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `UPDATE users
        SET id_doc_url = $2,
            selfie_url = $3,
            kyc_status = $4::kyc_status,
            kyc_note = $5,
            kyc_submitted_at = now(),
            kyc_reviewed_at = CASE WHEN $4 = 'verified' THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [userId, input.idDocUrl, input.selfieUrl, input.status, input.note],
  );
  return rows[0] ?? null;
}

export async function setKycDecision(
  userId: string,
  status: "verified" | "rejected" | "manual_review",
  note: string | null,
): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `UPDATE users
        SET kyc_status = $2::kyc_status,
            kyc_note = $3,
            kyc_reviewed_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING ${USER_COLUMNS}`,
    [userId, status, note],
  );
  return rows[0] ?? null;
}
