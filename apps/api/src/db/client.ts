import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

const isSupabase = /supabase\.(co|com)/i.test(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase terminates TLS with a chain Node does not trust by default.
  ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

export async function pingDb() {
  const result = await query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
