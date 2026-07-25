import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sqlPath = path.resolve(__dirname, "../../db/init.sql");
  const sql = await fs.readFile(sqlPath, "utf8");
  await pool.query(sql);
  console.log("✓ Schema applied from db/init.sql");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
