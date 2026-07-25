-- Demo data for provider discovery, pings and trust scores.
-- Dev/demo only — NOT a migration, never runs automatically.
--
--   psql "$DATABASE_URL" -f apps/api/db/seeds/marketplace_demo.sql
--
-- Safe to run repeatedly: every row is upserted on a fixed UUID.
-- Points are real Addis Ababa locations; the customer sits at Bole Medhanialem.

BEGIN;

-- Customers -----------------------------------------------------------------
INSERT INTO users (id, phone, name, role, kyc_status) VALUES
  ('11111111-1111-4111-8111-111111111111', '+251911000001', 'Sara Bekele',  'user', 'verified'),
  ('11111111-1111-4111-8111-111111111112', '+251911000002', 'Yonas Girma',  'user', 'pending')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Providers -----------------------------------------------------------------
INSERT INTO users (id, phone, name, role, kyc_status, id_doc_url, selfie_url) VALUES
  ('22222222-2222-4222-8222-222222222201', '+251911000101', 'Abebe Tadesse',  'provider', 'verified',      'demo://id/1', 'demo://selfie/1'),
  ('22222222-2222-4222-8222-222222222202', '+251911000102', 'Kalkidan Alemu', 'provider', 'verified',      'demo://id/2', 'demo://selfie/2'),
  ('22222222-2222-4222-8222-222222222203', '+251911000103', 'Dawit Haile',    'provider', 'pending',       NULL,          NULL),
  ('22222222-2222-4222-8222-222222222204', '+251911000104', 'Meron Assefa',   'provider', 'manual_review', 'demo://id/4', 'demo://selfie/4'),
  ('22222222-2222-4222-8222-222222222205', '+251911000105', 'Tesfaye Bekele', 'provider', 'rejected',      'demo://id/5', 'demo://selfie/5'),
  ('22222222-2222-4222-8222-222222222206', '+251911000106', 'Hanna Girma',    'provider', 'verified',      'demo://id/6', 'demo://selfie/6')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kyc_status = EXCLUDED.kyc_status;

-- base_lat/base_lng only: the 002 trigger fills the geography column.
INSERT INTO providers (user_id, category, bio, experience_years, base_lat, base_lng, is_online, firecrawl_profile_match) VALUES
  -- ~300 m from the customer
  ('22222222-2222-4222-8222-222222222201', 'plumber',     'Burst pipes and water heaters, 15 years.',     15, 8.9975, 38.7885, true,  true),
  -- ~1.4 km
  ('22222222-2222-4222-8222-222222222202', 'electrician', 'Wiring, breaker panels, generator hookups.',    8, 9.0060, 38.7930, true,  false),
  -- ~2.6 km
  ('22222222-2222-4222-8222-222222222203', 'plumber',     'Drain clearing, new to the platform.',          1, 9.0180, 38.7820, false, false),
  -- ~4.5 km
  ('22222222-2222-4222-8222-222222222204', 'cleaner',     'Deep cleaning for homes and offices.',          5, 9.0330, 38.7700, true,  false),
  -- ~7 km — outside a 5 km radius
  ('22222222-2222-4222-8222-222222222205', 'plumber',     'Far side of town.',                             3, 9.0540, 38.7480, true,  false),
  -- ~900 m, heavily flagged
  ('22222222-2222-4222-8222-222222222206', 'plumber',     'Cheap and fast.',                               2, 8.9900, 38.7820, true,  false)
ON CONFLICT (user_id) DO UPDATE
  SET category = EXCLUDED.category,
      bio = EXCLUDED.bio,
      experience_years = EXCLUDED.experience_years,
      base_lat = EXCLUDED.base_lat,
      base_lng = EXCLUDED.base_lng,
      is_online = EXCLUDED.is_online,
      firecrawl_profile_match = EXCLUDED.firecrawl_profile_match;

-- Completed contracts feed the trust formula --------------------------------
INSERT INTO service_requests (id, user_id, category, lat, lng, status, description)
SELECT
  ('44444444-4444-4444-8444-4444444444' || lpad(i::text, 2, '0'))::uuid,
  '11111111-1111-4111-8111-111111111111',
  'plumber', 8.9950, 38.7870, 'completed', 'Seeded historical job'
FROM generate_series(1, 14) AS g(i)
ON CONFLICT (id) DO NOTHING;

INSERT INTO contracts (id, request_id, provider_id, user_id, agreed_amount, status, completed_at)
SELECT
  ('33333333-3333-4333-8333-3333333333' || lpad(i::text, 2, '0'))::uuid,
  ('44444444-4444-4444-8444-4444444444' || lpad(i::text, 2, '0'))::uuid,
  provider_id,
  '11111111-1111-4111-8111-111111111111',
  850.00,
  'completed',
  now() - (i || ' days')::interval
FROM (VALUES
  (1,  '22222222-2222-4222-8222-222222222201'::uuid),
  (2,  '22222222-2222-4222-8222-222222222201'::uuid),
  (3,  '22222222-2222-4222-8222-222222222201'::uuid),
  (4,  '22222222-2222-4222-8222-222222222201'::uuid),
  (5,  '22222222-2222-4222-8222-222222222201'::uuid),
  (6,  '22222222-2222-4222-8222-222222222201'::uuid),
  (7,  '22222222-2222-4222-8222-222222222201'::uuid),
  (8,  '22222222-2222-4222-8222-222222222201'::uuid),
  (9,  '22222222-2222-4222-8222-222222222201'::uuid),
  (10, '22222222-2222-4222-8222-222222222201'::uuid),
  (11, '22222222-2222-4222-8222-222222222202'::uuid),
  (12, '22222222-2222-4222-8222-222222222202'::uuid),
  (13, '22222222-2222-4222-8222-222222222202'::uuid),
  (14, '22222222-2222-4222-8222-222222222206'::uuid)
) AS p(i, provider_id)
ON CONFLICT (id) DO NOTHING;

-- One live job, for the tracking map -----------------------------------------
INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status)
VALUES ('44444444-4444-4444-8444-444444444490', '11111111-1111-4111-8111-111111111111',
        'plumber', 'Bathroom tap will not stop running', 'high',
        8.9950, 38.7870, 'Bole Medhanialem', 'in_progress')
ON CONFLICT (id) DO UPDATE SET status = 'in_progress';

INSERT INTO contracts (id, request_id, provider_id, user_id, agreed_amount, status)
VALUES ('33333333-3333-4333-8333-333333333390', '44444444-4444-4444-8444-444444444490',
        '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111',
        1200.00, 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';

-- Reviews --------------------------------------------------------------------
INSERT INTO reviews (id, contract_id, provider_id, reviewer_user_id, rating, comment)
SELECT
  ('55555555-5555-4555-8555-5555555555' || lpad(i::text, 2, '0'))::uuid,
  ('33333333-3333-4333-8333-3333333333' || lpad(i::text, 2, '0'))::uuid,
  provider_id,
  '11111111-1111-4111-8111-111111111111',
  rating,
  comment
FROM (VALUES
  (1,  '22222222-2222-4222-8222-222222222201'::uuid, 5, 'Fixed the leak in 20 minutes.'),
  (2,  '22222222-2222-4222-8222-222222222201'::uuid, 5, 'Very professional.'),
  (3,  '22222222-2222-4222-8222-222222222201'::uuid, 4, 'Good work, arrived a bit late.'),
  (11, '22222222-2222-4222-8222-222222222202'::uuid, 4, 'Sorted the breaker panel.'),
  (12, '22222222-2222-4222-8222-222222222202'::uuid, 5, 'Knows generators well.'),
  (14, '22222222-2222-4222-8222-222222222206'::uuid, 2, 'Had to call someone else after.')
) AS v(i, provider_id, rating, comment)
ON CONFLICT (contract_id) DO NOTHING;

-- Flags received by a provider (the 002 direction) ---------------------------
INSERT INTO flags (id, target_provider_id, reporter_user_id, reason) VALUES
  ('66666666-6666-4666-8666-666666666601', '22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111111', 'Quoted one price, charged another'),
  ('66666666-6666-4666-8666-666666666602', '22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111112', 'Did not show up')
ON CONFLICT (id) DO NOTHING;

COMMIT;
