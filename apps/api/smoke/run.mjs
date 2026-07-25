import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs every smoke suite against a running API.
 *
 *   pnpm --filter @zeyla/api smoke            # expects the API on :4000
 *   ZEYLA_PORT=4001 pnpm --filter @zeyla/api smoke
 *
 * These hit a real API, a real PostGIS and a real Redis on purpose — the parts
 * worth checking (radius search, socket rooms, the Redis TTL, transaction
 * behaviour) are exactly the parts a mock would fake.
 *
 * They expect apps/api/db/seeds/marketplace_demo.sql to be loaded.
 */
const SUITES = [
  "ping-flow",
  "tracking",
  "trust",
  "notifications",
  "voice",
  "matching",
  "contract-events",
];
const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.ZEYLA_PORT ?? "4000";

const run = (suite) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, `${suite}.mjs`)], {
      stdio: "inherit",
      // These suites are HTTP clients: which AI stages run is decided by the
      // server's own environment, so there is nothing to override from here.
      // Assertions are written to hold with or without the model keys set.
      env: { ...process.env, ZEYLA_PORT: port },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n======== ${suite} ========`);
  if ((await run(suite)) !== 0) failed++;
}

console.log(
  failed === 0
    ? `\n${SUITES.length} suites passed`
    : `\n${failed} of ${SUITES.length} suites failed`,
);
process.exit(failed === 0 ? 0 : 1);
