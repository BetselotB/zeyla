import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.resolve(__dirname, "../../db/seeds");

/**
 * Runs a file from db/seeds. Same shape as migrate.ts, so seeding needs the
 * app's DATABASE_URL and nothing else — no local psql, no shell env juggling.
 *
 *   pnpm db:seed                  -> marketplace_demo.sql
 *   pnpm db:seed reset            -> reset.sql
 *
 * Each file is sent as one string, so its own BEGIN/COMMIT wraps the work and a
 * failure anywhere leaves the database untouched.
 */
async function seed() {
  const requested = process.argv[2] ?? "marketplace_demo";
  const file = requested.endsWith(".sql") ? requested : `${requested}.sql`;
  const filePath = path.join(seedsDir, file);

  // Keep the argument from reaching outside db/seeds.
  if (path.dirname(filePath) !== seedsDir) {
    throw new Error(`Seed must live directly in db/seeds: ${requested}`);
  }

  const sql = await fs.readFile(filePath, "utf8");
  await pool.query(sql);
  console.log(`✓ ${file}`);
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
