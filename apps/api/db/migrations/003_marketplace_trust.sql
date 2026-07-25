-- 003 — marketplace / realtime / trust support columns
-- Owner: Mohammed (marketplace, realtime, notifications, trust)
--
-- Additive only. 001 and 002 have already been applied on other machines, so
-- this file never rewrites them. Every statement is safe to run twice.

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------

ALTER TABLE providers ADD COLUMN IF NOT EXISTS firecrawl_profile_match BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS service_radius_meters INT NOT NULL DEFAULT 10000;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Discovery filters on (category, trust) after the GiST radius cut.
CREATE INDEX IF NOT EXISTS providers_category_trust_idx
  ON providers (category, trust_score DESC);

-- Discovery reads providers.location, but onboarding may only write
-- base_lat/base_lng. Keep the indexed geography column in sync so a provider
-- can never be invisible to search because of which column a writer chose.
CREATE OR REPLACE FUNCTION zeyla_sync_provider_location() RETURNS trigger AS $$
BEGIN
  IF NEW.base_lat IS NOT NULL AND NEW.base_lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.base_lng, NEW.base_lat), 4326)::geography;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_sync_location ON providers;
CREATE TRIGGER providers_sync_location
  BEFORE INSERT OR UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION zeyla_sync_provider_location();

UPDATE providers
   SET location = ST_SetSRID(ST_MakePoint(base_lng, base_lat), 4326)::geography
 WHERE location IS NULL AND base_lat IS NOT NULL AND base_lng IS NOT NULL;

-- ---------------------------------------------------------------------------
-- service_requests
-- ---------------------------------------------------------------------------

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS radius_meters INT NOT NULL DEFAULT 5000;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS address_label TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS voice_audio_url TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS voice_transcript TEXT;
-- Raw Addis AI parse: { category, urgency, location, confidence, ... }
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS nlp JSONB;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE service_requests ADD CONSTRAINT service_requests_urgency_check
    CHECK (urgency IN ('low', 'normal', 'high', 'emergency'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS service_requests_user_idx ON service_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON service_requests (status);

CREATE OR REPLACE FUNCTION zeyla_sync_request_location() RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_requests_sync_location ON service_requests;
CREATE TRIGGER service_requests_sync_location
  BEFORE INSERT OR UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION zeyla_sync_request_location();

UPDATE service_requests
   SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 WHERE location IS NULL;

-- ---------------------------------------------------------------------------
-- pings
-- ---------------------------------------------------------------------------

ALTER TABLE pings ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;
ALTER TABLE pings ADD COLUMN IF NOT EXISTS trust_score_at_ping NUMERIC(5,2);
ALTER TABLE pings ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
ALTER TABLE pings ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE pings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pings_provider_idx ON pings (provider_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS pings_request_idx ON pings (request_id);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

-- Denormalised so the trust recompute never has to join through contracts,
-- which belongs to the escrow module.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(user_id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_user_id UUID REFERENCES users(id);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS transcript_source TEXT;

UPDATE reviews r
   SET provider_id = c.provider_id,
       reviewer_user_id = c.user_id
  FROM contracts c
 WHERE c.id = r.contract_id AND r.provider_id IS NULL;

CREATE INDEX IF NOT EXISTS reviews_provider_idx ON reviews (provider_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- flags
-- ---------------------------------------------------------------------------

-- 001 modelled one direction only (a provider flags a user). The trust formula
-- subtracts flags *received by a provider*, so the table has to carry both.
-- Exactly one of flagged_user_id / target_provider_id is set per row.
ALTER TABLE flags ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE flags ALTER COLUMN flagged_user_id DROP NOT NULL;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS target_provider_id UUID REFERENCES providers(user_id);
ALTER TABLE flags ADD COLUMN IF NOT EXISTS reporter_user_id UUID REFERENCES users(id);
ALTER TABLE flags ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id);
ALTER TABLE flags ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

DO $$ BEGIN
  ALTER TABLE flags ADD CONSTRAINT flags_single_target_check
    CHECK ((target_provider_id IS NOT NULL) <> (flagged_user_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE flags ADD CONSTRAINT flags_status_check
    CHECK (status IN ('open', 'upheld', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS flags_target_provider_idx ON flags (target_provider_id)
  WHERE target_provider_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- trust_score_log
-- ---------------------------------------------------------------------------

ALTER TABLE trust_score_log ADD COLUMN IF NOT EXISTS previous_score NUMERIC(5,2);
ALTER TABLE trust_score_log ADD COLUMN IF NOT EXISTS new_score NUMERIC(5,2);
-- Full component breakdown at the time of the change, so the UI can explain a
-- score without recomputing it.
ALTER TABLE trust_score_log ADD COLUMN IF NOT EXISTS breakdown JSONB;

CREATE INDEX IF NOT EXISTS trust_score_log_provider_idx
  ON trust_score_log (provider_id, created_at DESC);
