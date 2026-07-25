-- 004 — in-app notification feed
-- Owner: Mohammed (notifications module)
--
-- Separate from 003 on purpose: that one only touches tables 001 already
-- created, this one adds a table. If the team decides the feed is not worth the
-- row count during the demo, this file can be dropped on its own.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ping_received, ping_accepted, ping_declined, contract_update,
  -- review_received, trust_score_changed, system
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  -- Deep-link payload: requestId / pingId / contractId / providerId as needed.
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);

-- Powers the unread badge without scanning the whole feed.
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;
