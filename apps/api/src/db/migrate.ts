import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

async function migrate() {
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found in db/migrations");
    await pool.end();
    return;
  }

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    console.log(`✓ ${file}`);
  }

  console.log(`Applied ${files.length} migration(s)`);
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
