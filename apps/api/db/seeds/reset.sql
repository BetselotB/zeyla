-- Wipes every application row. Dev/demo only — NOT a migration.
--
--   psql "$DATABASE_URL" -f apps/api/db/seeds/reset.sql
--
-- Schema, extensions and triggers survive; only data goes. Supabase's own
-- `auth.users` is deliberately left alone, so an existing Google or email login
-- still works — the next sign-in re-creates the `public.users` row through
-- upsertUserByIdentity and drops that person back at onboarding.
--
-- Destructive and irreversible. Take a copy first if the rows matter.

BEGIN;

-- The pooler hands out connections without a guaranteed search_path.
SET search_path TO public;

-- One statement so foreign keys never see a half-empty graph. CASCADE is here
-- for tables a later migration may hang off these; every dependent table in the
-- schema today is already named.
TRUNCATE TABLE
  chapa_webhook_events,
  escrow_ledger,
  contract_events,
  reviews,
  flags,
  trust_score_log,
  notifications,
  pings,
  contracts,
  service_requests,
  provider_availability_log,
  providers,
  auth_sessions,
  auth_otp_codes,
  users
CASCADE;

COMMIT;
