-- Zeyla — Identity & Money (auth, KYC, contracts, escrow ledger)
-- Owner: @betselot. Touches only auth/contract/escrow tables; leaves
-- providers / service_requests / pings / reviews / flags / trust_score_log
-- to the Marketplace & Realtime owner.
--
-- Re-runnable: db/migrate.ts replays every file in sorted order on each run,
-- so every statement here must be idempotent.

-- ---------------------------------------------------------------------------
-- Auth: phone OTP + opaque server sessions
-- ---------------------------------------------------------------------------

-- One row per OTP request. Codes are stored hashed so a database dump never
-- leaks a live login code.
CREATE TABLE IF NOT EXISTS auth_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otp_codes_phone_idx
  ON auth_otp_codes (phone, created_at DESC);

-- Sessions issued by this API when Supabase phone auth is not configured.
-- When Supabase IS configured the Supabase JWT is authoritative and no row
-- is written here.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);

-- ---------------------------------------------------------------------------
-- KYC bookkeeping on users
-- ---------------------------------------------------------------------------

-- Accounts are created from a phone number, but Chapa requires an email on
-- every transaction and rejects domains without MX records, so a real address
-- has to be collected somewhere before checkout.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------

-- A contract can be funded before a marketplace service_request exists (and in
-- the escrow-only demo path there is no request at all), so the link is
-- optional rather than required.
ALTER TABLE contracts ALTER COLUMN request_id DROP NOT NULL;

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ETB';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS contracts_user_idx ON contracts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_provider_idx ON contracts (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts (status);

-- Append-only audit trail of every state-machine transition. This is what the
-- demo shows to prove the escrow flow is real and not hand-waved.
CREATE TABLE IF NOT EXISTS contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  from_status contract_status,
  to_status contract_status NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_events_contract_idx
  ON contract_events (contract_id, created_at);

-- ---------------------------------------------------------------------------
-- Escrow ledger
-- ---------------------------------------------------------------------------

ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ETB';
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS provider_payout NUMERIC(12,2);
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS chapa_transfer_ref TEXT;
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE escrow_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- tx_ref is what Chapa echoes back on the webhook, so it has to resolve to
-- exactly one ledger row.
CREATE UNIQUE INDEX IF NOT EXISTS escrow_ledger_tx_ref_key
  ON escrow_ledger (chapa_tx_ref) WHERE chapa_tx_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS escrow_ledger_contract_idx
  ON escrow_ledger (contract_id, created_at DESC);

-- Every webhook body we accepted, keyed by a hash of the raw payload so a
-- retried delivery is a no-op instead of a double credit.
CREATE TABLE IF NOT EXISTS chapa_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_hash TEXT NOT NULL UNIQUE,
  tx_ref TEXT,
  event_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chapa_webhook_events_tx_ref_idx
  ON chapa_webhook_events (tx_ref);
