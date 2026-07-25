import pg from "pg";

/**
 * Clears the rows the trust suite writes, so `pnpm smoke` gives the same answer
 * the second time it is run. Reviews and flags are one-shot by design (one
 * review per contract, one flag per reporter per target), which is exactly what
 * makes them unrepeatable to test.
 *
 * Only ever touches the seed's fixed UUIDs.
 */
const DEFAULT_URL = "postgresql://zeyla:zeyla@localhost:5432/zeyla";

const SEED_CONTRACT_UNDER_TEST = "33333333-3333-4333-8333-333333333304";
const SEED_PROVIDERS = [
  "22222222-2222-4222-8222-222222222201",
  "22222222-2222-4222-8222-222222222202",
  "22222222-2222-4222-8222-222222222203",
  "22222222-2222-4222-8222-222222222205",
  "22222222-2222-4222-8222-222222222206",
];
const SEED_USERS = [
  "11111111-1111-4111-8111-111111111111",
  "11111111-1111-4111-8111-111111111112",
];

export async function resetTrustFixtures() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
  });

  try {
    await client.connect();
  } catch (err) {
    console.log(`      (skipping fixture reset: ${err.message})`);
    return false;
  }

  try {
    await client.query("DELETE FROM reviews WHERE contract_id = $1::uuid", [
      SEED_CONTRACT_UNDER_TEST,
    ]);
    await client.query(
      `DELETE FROM flags
        WHERE target_provider_id = ANY($1::uuid[])
          AND id NOT IN ('66666666-6666-4666-8666-666666666601',
                         '66666666-6666-4666-8666-666666666602')`,
      [SEED_PROVIDERS],
    );
    await client.query(
      `DELETE FROM flags WHERE flagged_user_id = ANY($1::uuid[])`,
      [SEED_USERS],
    );
    // Back to the seed baseline; the suite recomputes from facts anyway.
    await client.query(
      "UPDATE providers SET trust_score = 50 WHERE user_id = ANY($1::uuid[])",
      [SEED_PROVIDERS],
    );
    await client.query(
      "DELETE FROM trust_score_log WHERE provider_id = ANY($1::uuid[])",
      [SEED_PROVIDERS],
    );
    return true;
  } finally {
    await client.end();
  }
}
