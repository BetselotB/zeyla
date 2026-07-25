-- Zeyla — Supabase email/password and Google OAuth identities
-- Owner: @betselot. Touches only the users table.
--
-- Re-runnable: db/migrate.ts replays every file in sorted order on each run,
-- so every statement here must be idempotent.

-- ---------------------------------------------------------------------------
-- Identifiers
-- ---------------------------------------------------------------------------

-- Until now every account started from a phone number. An account created with
-- email/password or Google has none, and may never get one. Phone stays UNIQUE
-- so the OTP path still resolves to exactly one row — it is only no longer
-- required.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT;

-- Email is the join key when a user signs in with Google after having signed
-- up with a password (or vice versa) — Supabase issues one auth uid per
-- identity, we want one Zeyla account. Duplicates cannot be deduped
-- automatically, so a database that already has them keeps working without the
-- index rather than failing the migration.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
    ON users (lower(email)) WHERE email IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '005: users.email holds duplicates — unique index skipped. Dedupe, then re-run.';
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_auth_provider_check
    CHECK (auth_provider IS NULL OR auth_provider IN ('phone', 'email', 'google'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A row with none of the three is unreachable by every login path.
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_identifier_present_check
    CHECK (phone IS NOT NULL OR email IS NOT NULL OR auth_uid IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Onboarding gate
-- ---------------------------------------------------------------------------

-- The web app refuses to render anything but /onboarding until this is set, so
-- it is the single source of truth for "has finished signing up" — distinct
-- from "has a valid token", which a half-finished signup also has.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE users
   SET auth_provider = 'phone'
 WHERE auth_provider IS NULL AND phone IS NOT NULL;

-- Accounts that already cleared KYC finished the pre-gate flow. Sending them
-- back through onboarding would be a regression, not a migration.
UPDATE users
   SET onboarding_completed_at = COALESCE(kyc_reviewed_at, kyc_submitted_at, created_at)
 WHERE onboarding_completed_at IS NULL AND kyc_status = 'verified';
