-- Zeyla — provider profile fields collected during onboarding
-- Owner: @mohammed (marketplace). Touches only the providers table.
--
-- Re-runnable: db/migrate.ts replays every file in sorted order on each run,
-- so every statement here must be idempotent.

-- The onboarding provider form has always collected these; before this
-- migration POST /api/marketplace/providers had nowhere to put them and the
-- frontend mocked the response.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS sub_city TEXT;
-- A provider can publish a work number different from the login phone.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS price_min NUMERIC(12,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS price_max NUMERIC(12,2);

DO $$ BEGIN
  ALTER TABLE providers ADD CONSTRAINT providers_price_range_check
    CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS providers_sub_city_idx ON providers (sub_city)
  WHERE sub_city IS NOT NULL;
