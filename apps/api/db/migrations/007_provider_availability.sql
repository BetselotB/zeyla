-- 007 — provider availability ("go online") intent
-- Owner: @mohammed (marketplace / realtime).
--
-- Until now `providers.is_online` was written straight from the socket
-- lifecycle: opening the app made a provider discoverable and closing the last
-- tab hid them, with no way to be logged in but off duty. This migration adds
-- the intent the provider actually controls and demotes `is_online` to a
-- derived column, so there is exactly one way onto the radar.
--
-- Additive and re-runnable: db/migrate.ts replays every file in sorted order.

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------

ALTER TABLE providers ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'offline';
-- Start of the current online stretch. Cleared when they go offline.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS went_online_at TIMESTAMPTZ;
-- Who flipped it last: the provider, or the server on job accept / completion.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS availability_source TEXT NOT NULL DEFAULT 'provider';

DO $$ BEGIN
  ALTER TABLE providers ADD CONSTRAINT providers_availability_status_check
    CHECK (availability_status IN ('offline', 'online', 'busy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE providers ADD CONSTRAINT providers_availability_source_check
    CHECK (availability_source IN ('provider', 'job_accepted', 'job_finished', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anyone already flagged online keeps their listing rather than silently
-- dropping off the radar the moment this runs.
UPDATE providers
   SET availability_status = 'online'
 WHERE is_online = true AND availability_status = 'offline';

/*
 * `is_online` is now a projection of the intent, not an input. Enforcing that
 * here rather than in the service means an ad-hoc UPDATE during the demo — or a
 * writer in another module that predates this migration — cannot put a provider
 * on the radar without them choosing to be there.
 */
CREATE OR REPLACE FUNCTION zeyla_sync_provider_availability() RETURNS trigger AS $$
BEGIN
  NEW.is_online := (NEW.availability_status = 'online');

  IF NEW.availability_status = 'offline' THEN
    NEW.went_online_at := NULL;
    RETURN NEW;
  END IF;

  -- OLD only exists on UPDATE, so the continuing-stretch case has to be the
  -- one that reads it.
  IF TG_OP = 'UPDATE' AND OLD.availability_status <> 'offline' THEN
    NEW.went_online_at := COALESCE(NEW.went_online_at, OLD.went_online_at, now());
  ELSE
    -- 'busy' is reachable straight from 'offline' when a provider accepts a job
    -- out of a notification, so either non-offline status opens the stretch.
    NEW.went_online_at := now();
    NEW.last_seen_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_sync_availability ON providers;
CREATE TRIGGER providers_sync_availability
  BEFORE INSERT OR UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION zeyla_sync_provider_availability();

-- Fan-out and the "who else is online" count both start from this predicate,
-- and the online set is a small slice of the table.
CREATE INDEX IF NOT EXISTS providers_available_idx
  ON providers (category, trust_score DESC)
  WHERE availability_status = 'online';

-- ---------------------------------------------------------------------------
-- provider_availability_log
-- ---------------------------------------------------------------------------

-- Append-only transition trail. Online hours are derived from it by measuring
-- the gap to the next row, so no counter has to be kept correct on a column.
CREATE TABLE IF NOT EXISTS provider_availability_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(user_id) ON DELETE CASCADE,
  previous_status TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'provider',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE provider_availability_log ADD CONSTRAINT provider_availability_log_status_check
    CHECK (status IN ('offline', 'online', 'busy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every read is "this provider, most recent first, since midnight".
CREATE INDEX IF NOT EXISTS provider_availability_log_provider_idx
  ON provider_availability_log (provider_id, created_at DESC);
