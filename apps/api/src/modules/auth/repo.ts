import type { AuthUser } from "@zeyla/shared";
import { query } from "../../db/client.js";

/** Shape of the `users` row this module reads and writes. */
export interface UserRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: "user" | "provider";
  id_doc_url: string | null;
  selfie_url: string | null;
  kyc_status: "pending" | "verified" | "manual_review" | "rejected";
  kyc_submitted_at: Date | null;
  kyc_reviewed_at: Date | null;
  kyc_note: string | null;
  auth_uid: string | null;
  created_at: Date;
}

const USER_COLUMNS = `
  id, phone, name, email, role, id_doc_url, selfie_url, kyc_status,
  kyc_submitted_at, kyc_reviewed_at, kyc_note, auth_uid, created_at
`;

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    role: row.role,
    kycStatus: row.kyc_status,
    kycSubmittedAt: row.kyc_submitted_at?.toISOString() ?? null,
    kycReviewedAt: row.kyc_reviewed_at?.toISOString() ?? null,
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

/**
 * Idempotent by phone so a retried OTP verify never creates a duplicate
 * account. Also (re)links the Supabase uid when one is supplied.
 */
export async function upsertUserByPhone(
  phone: string,
  authUid: string | null,
): Promise<{ user: UserRow; created: boolean }> {
  const { rows } = await query<UserRow & { inserted: boolean }>(
    `INSERT INTO users (phone, auth_uid)
     VALUES ($1, $2)
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
