-- Demo data for discovery, pings, tracking, escrow and trust.
-- Dev/demo only — NOT a migration, never runs automatically.
--
--   psql "$DATABASE_URL" -f apps/api/db/seeds/marketplace_demo.sql
--
-- Safe to run repeatedly. Every row uses a fixed UUID off a per-table prefix,
-- and the seed deletes anything carrying those prefixes before inserting, so a
-- re-run replaces the demo world without touching rows created by real signups.
-- To clear those too, run seeds/reset.sql first.
--
-- Coordinates are real Addis Ababa locations. The demo customer sits at Bole
-- Medhanialem (8.9950, 38.7870); provider distances are measured from there.
--
-- UUID prefixes
--   1… customers   2… providers   3… contracts  4… service requests
--   5… reviews     6… flags       7… escrow     8… pings   9… notifications
-- Suffixes 01-44 are generated job history; 90-96 are the hand-built scenarios
-- the demo script walks through.

BEGIN;

SET search_path TO public;

-- ---------------------------------------------------------------------------
-- Clear the previous demo world (prefix-scoped, so real accounts are untouched)
-- ---------------------------------------------------------------------------

DELETE FROM contract_events WHERE contract_id::text LIKE '33333333-3333-4333-8333-%';
DELETE FROM escrow_ledger   WHERE id::text          LIKE '77777777-7777-4777-8777-%';
DELETE FROM reviews         WHERE id::text          LIKE '55555555-5555-4555-8555-%';
DELETE FROM flags           WHERE id::text          LIKE '66666666-6666-4666-8666-%';
DELETE FROM pings           WHERE id::text          LIKE '88888888-8888-4888-8888-%';
DELETE FROM notifications   WHERE id::text          LIKE '99999999-9999-4999-8999-%';
DELETE FROM trust_score_log WHERE provider_id::text LIKE '22222222-2222-4222-8222-%';
DELETE FROM provider_availability_log
                            WHERE provider_id::text LIKE '22222222-2222-4222-8222-%';
DELETE FROM contracts       WHERE id::text          LIKE '33333333-3333-4333-8333-%';
DELETE FROM service_requests WHERE id::text         LIKE '44444444-4444-4444-8444-%';
DELETE FROM providers       WHERE user_id::text     LIKE '22222222-2222-4222-8222-%';
DELETE FROM users           WHERE id::text          LIKE '11111111-1111-4111-8111-%'
                               OR id::text          LIKE '22222222-2222-4222-8222-%';

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

INSERT INTO users (id, phone, name, role, kyc_status, auth_provider, avatar_url, onboarding_completed_at) VALUES
  ('11111111-1111-4111-8111-111111111101', '+251911000001', 'Sara Bekele',   'user', 'verified', 'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Sara%20Bekele',   now() - interval '40 days'),
  ('11111111-1111-4111-8111-111111111102', '+251911000002', 'Yonas Girma',   'user', 'pending',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Yonas%20Girma',   now() - interval '22 days'),
  ('11111111-1111-4111-8111-111111111103', '+251911000003', 'Liya Tesfaye',  'user', 'verified', 'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Liya%20Tesfaye',  now() - interval '15 days'),
  ('11111111-1111-4111-8111-111111111104', '+251911000004', 'Nahom Wolde',   'user', 'pending',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Nahom%20Wolde',   now() - interval '6 days');

-- ---------------------------------------------------------------------------
-- Providers
-- ---------------------------------------------------------------------------

INSERT INTO users (id, phone, name, role, kyc_status, id_doc_url, selfie_url, kyc_submitted_at, auth_provider, avatar_url, onboarding_completed_at) VALUES
  ('22222222-2222-4222-8222-222222222201', '+251911000101', 'Abebe Tadesse',     'provider', 'verified',      'demo://id/1',  'demo://selfie/1',  now() - interval '60 days', 'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Abebe%20Tadesse',     now() - interval '59 days'),
  ('22222222-2222-4222-8222-222222222202', '+251911000102', 'Kalkidan Alemu',    'provider', 'verified',      'demo://id/2',  'demo://selfie/2',  now() - interval '55 days', 'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Kalkidan%20Alemu',    now() - interval '54 days'),
  ('22222222-2222-4222-8222-222222222203', '+251911000103', 'Dawit Haile',       'provider', 'pending',       NULL,           NULL,               NULL,                        'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Dawit%20Haile',       now() - interval '3 days'),
  ('22222222-2222-4222-8222-222222222204', '+251911000104', 'Meron Assefa',      'provider', 'manual_review', 'demo://id/4',  'demo://selfie/4',  now() - interval '9 days',   'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Meron%20Assefa',      now() - interval '9 days'),
  ('22222222-2222-4222-8222-222222222205', '+251911000105', 'Tesfaye Bekele',    'provider', 'rejected',      'demo://id/5',  'demo://selfie/5',  now() - interval '30 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Tesfaye%20Bekele',    now() - interval '29 days'),
  ('22222222-2222-4222-8222-222222222206', '+251911000106', 'Hanna Girma',       'provider', 'verified',      'demo://id/6',  'demo://selfie/6',  now() - interval '25 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Hanna%20Girma',       now() - interval '24 days'),
  ('22222222-2222-4222-8222-222222222207', '+251911000107', 'Samuel Girma',      'provider', 'verified',      'demo://id/7',  'demo://selfie/7',  now() - interval '70 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Samuel%20Girma',      now() - interval '69 days'),
  ('22222222-2222-4222-8222-222222222208', '+251911000108', 'Bethlehem Tadesse', 'provider', 'verified',      'demo://id/8',  'demo://selfie/8',  now() - interval '45 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Bethlehem%20Tadesse', now() - interval '44 days'),
  ('22222222-2222-4222-8222-222222222209', '+251911000109', 'Mikias Assefa',     'provider', 'verified',      'demo://id/9',  'demo://selfie/9',  now() - interval '50 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Mikias%20Assefa',     now() - interval '49 days'),
  ('22222222-2222-4222-8222-222222222210', '+251911000110', 'Rahel Negash',      'provider', 'verified',      'demo://id/10', 'demo://selfie/10', now() - interval '18 days',  'phone', 'https://api.dicebear.com/7.x/initials/svg?seed=Rahel%20Negash',      now() - interval '17 days');

-- base_lat/base_lng only: the 003 trigger fills the geography column, and the
-- 007 trigger derives is_online / went_online_at from availability_status.
INSERT INTO providers (
  user_id, category, business_name, sub_city, contact_phone, bio, experience_years,
  base_lat, base_lng, availability_status, availability_source,
  firecrawl_profile_match, service_radius_meters, price_min, price_max, trust_score
) VALUES
  -- ~300 m from the customer — the provider the happy path picks.
  ('22222222-2222-4222-8222-222222222201', 'plumber',          'Abebe Plumbing Works',   'Bole',             '+251911000101', 'Burst pipes, water heaters and pressure pumps. 15 years around Bole.',        15, 8.9975, 38.7885, 'online',  'provider',     true,   8000,  600, 2500, 50),
  -- ~1.4 km — currently out on the live tracking job.
  ('22222222-2222-4222-8222-222222222202', 'electrician',      'Kal Electric',           'Bole',             '+251911000102', 'Wiring, breaker panels and generator hookups for homes and small offices.',    8, 9.0060, 38.7930, 'busy',    'job_accepted', true,  10000,  500, 3000, 50),
  -- ~2.6 km — brand new, no history, off duty.
  ('22222222-2222-4222-8222-222222222203', 'plumber',          'Dawit Drain Care',       'Yeka',             '+251911000103', 'Drain clearing and small leaks. New to the platform.',                         1, 9.0180, 38.7820, 'offline', 'provider',     false,  5000,  300, 1200, 50),
  -- ~2.8 km — KYC still in manual review.
  ('22222222-2222-4222-8222-222222222204', 'cleaner',          'Meron Home Care',        'Kirkos',           '+251911000104', 'Deep cleaning for homes and offices, weekly or one-off.',                      5, 9.0100, 38.7660, 'online',  'provider',     false, 12000,  400, 1800, 50),
  -- ~9 km — well outside a 5 km radius, and KYC was rejected.
  ('22222222-2222-4222-8222-222222222205', 'plumber',          'Tesfaye Pipe Fitting',   'Kolfe Keranio',    '+251911000105', 'Pipe fitting and water tanks. Far side of town.',                              3, 9.0300, 38.7120, 'online',  'provider',     false,  6000,  250,  900, 50),
  -- ~800 m — cheap, heavily flagged, low rated. The one trust should bury.
  ('22222222-2222-4222-8222-222222222206', 'plumber',          'Hanna Quick Fix',        'Bole',             '+251911000106', 'Cheap and fast.',                                                             2, 8.9900, 38.7820, 'online',  'provider',     false,  5000,  200,  800, 50),
  -- ~6 km — the top-rated tradesperson overall.
  ('22222222-2222-4222-8222-222222222207', 'carpenter',        'Samuel Woodcraft',       'Lideta',           '+251911000107', 'Built-in wardrobes, kitchen cabinets and door hanging. Own workshop.',        11, 9.0150, 38.7350, 'online',  'provider',     true,  15000,  800, 4500, 50),
  -- ~6 km
  ('22222222-2222-4222-8222-222222222208', 'painter',          'Beti Paint & Finish',    'Arada',            '+251911000108', 'Interior and exterior painting, plaster repair, two-person crew.',             6, 9.0350, 38.7500, 'online',  'provider',     false, 12000,  700, 3500, 50),
  -- ~5.5 km — off duty but well reviewed.
  ('22222222-2222-4222-8222-222222222209', 'appliance_repair', 'Mikias Appliance Clinic','Nifas Silk-Lafto', '+251911000109', 'Fridges, washing machines and ovens. Parts sourced from Merkato.',             9, 8.9720, 38.7420, 'offline', 'provider',     true,  10000,  450, 2600, 50),
  -- ~7.4 km — covers the whole city.
  ('22222222-2222-4222-8222-222222222210', 'mover',            'Rahel Movers',           'Addis Ketema',     '+251911000110', 'House and office moves with a three-tonne truck and two loaders.',             4, 9.0380, 38.7360, 'online',  'provider',     false, 20000, 1000, 6000, 50);

-- A short shift trail so the provider home screen has hours to show.
INSERT INTO provider_availability_log (provider_id, previous_status, status, source, lat, lng, created_at)
SELECT p.user_id, s.previous_status, s.status, s.source, p.base_lat, p.base_lng, now() - (s.hours_ago || ' hours')::interval
FROM providers p
CROSS JOIN (VALUES
  ('offline', 'online',  'provider', 9),
  ('online',  'offline', 'provider', 6),
  ('offline', 'online',  'provider', 3)
) AS s(previous_status, status, source, hours_ago)
WHERE p.user_id::text LIKE '22222222-2222-4222-8222-%';

-- The current status, logged last so the trail ends where the row sits now.
INSERT INTO provider_availability_log (provider_id, previous_status, status, source, lat, lng, created_at)
SELECT p.user_id, 'online', p.availability_status, p.availability_source, p.base_lat, p.base_lng, now() - interval '35 minutes'
FROM providers p
WHERE p.user_id::text LIKE '22222222-2222-4222-8222-%'
  AND p.availability_status <> 'online';

-- ---------------------------------------------------------------------------
-- Generated job history — the completed work the trust formula reads
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_history ON COMMIT DROP AS
WITH plan(provider_id, jobs, base_rating, blurbs) AS (
  VALUES
    ('22222222-2222-4222-8222-222222222201'::uuid, 12, 5, ARRAY['Burst pipe under the kitchen sink', 'Water heater stopped heating', 'Replaced the bathroom mixer tap', 'Pressure pump kept cutting out', 'Toilet cistern running non-stop']),
    ('22222222-2222-4222-8222-222222222202'::uuid,  6, 5, ARRAY['Breaker tripping whenever the oven runs', 'Rewired the living room sockets', 'Generator changeover switch fitted', 'Installed outdoor security lighting']),
    ('22222222-2222-4222-8222-222222222204'::uuid,  3, 4, ARRAY['Deep clean after tenants moved out', 'Weekly office clean', 'Post-renovation dust clean']),
    ('22222222-2222-4222-8222-222222222205'::uuid,  1, 3, ARRAY['Water tank connected to the roof line']),
    ('22222222-2222-4222-8222-222222222206'::uuid,  3, 2, ARRAY['Unblocked a kitchen drain', 'Patched a leaking pipe joint', 'Replaced a shower head']),
    ('22222222-2222-4222-8222-222222222207'::uuid,  8, 5, ARRAY['Built a fitted bedroom wardrobe', 'Hung four interior doors', 'Kitchen cabinet doors replaced', 'Repaired a sagging staircase']),
    ('22222222-2222-4222-8222-222222222208'::uuid,  4, 4, ARRAY['Repainted two bedrooms', 'Exterior wall repaint', 'Plaster repair and skim before painting']),
    ('22222222-2222-4222-8222-222222222209'::uuid,  5, 5, ARRAY['Fridge compressor replaced', 'Washing machine drum bearing', 'Oven thermostat swapped out']),
    ('22222222-2222-4222-8222-222222222210'::uuid,  2, 4, ARRAY['Two bedroom flat moved to Ayat', 'Office relocation to Kazanchis'])
),
expanded AS (
  SELECT
    p.provider_id,
    p.base_rating,
    p.blurbs[1 + ((g.i - 1) % array_length(p.blurbs, 1))] AS description,
    row_number() OVER (ORDER BY p.provider_id, g.i)       AS n
  FROM plan p
  CROSS JOIN LATERAL generate_series(1, p.jobs) AS g(i)
)
SELECT
  e.n,
  e.provider_id,
  pr.category,
  e.description,
  ('44444444-4444-4444-8444-4444444444' || lpad(e.n::text, 2, '0'))::uuid AS request_id,
  ('33333333-3333-4333-8333-3333333333' || lpad(e.n::text, 2, '0'))::uuid AS contract_id,
  ('77777777-7777-4777-8777-7777777777' || lpad(e.n::text, 2, '0'))::uuid AS ledger_id,
  ('55555555-5555-4555-8555-5555555555' || lpad(e.n::text, 2, '0'))::uuid AS review_id,
  (ARRAY[
    '11111111-1111-4111-8111-111111111101'::uuid,
    '11111111-1111-4111-8111-111111111102'::uuid,
    '11111111-1111-4111-8111-111111111103'::uuid,
    '11111111-1111-4111-8111-111111111104'::uuid
  ])[1 + (e.n % 4)]                                            AS customer_id,
  -- Spread over 600–2600 ETB without looking sequential.
  (600 + ((e.n * 173) % 9) * 250)::numeric(12, 2)              AS amount,
  -- Jitter the job site around the provider's base so distances stay plausible.
  (pr.base_lat + (((e.n % 5) - 2) * 0.004))::double precision  AS lat,
  (pr.base_lng + (((e.n % 7) - 3) * 0.004))::double precision  AS lng,
  (now() - ((e.n * 29 + 6) || ' hours')::interval)             AS completed_at,
  (now() - ((e.n * 29 + 9) || ' hours')::interval)             AS created_at,
  -- Every third job goes unreviewed, and every fourth drops a star.
  (e.n % 3 <> 2)                                               AS reviewed,
  least(5, greatest(1, e.base_rating - (CASE WHEN e.n % 4 = 0 THEN 1 ELSE 0 END))) AS rating
FROM expanded e
JOIN providers pr ON pr.user_id = e.provider_id;

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, created_at, updated_at)
SELECT h.request_id, h.customer_id, h.category, h.description, 'normal', h.lat, h.lng, 'Addis Ababa', 'completed', h.created_at, h.completed_at
FROM seed_history h;

INSERT INTO contracts (id, request_id, provider_id, user_id, title, agreed_amount, currency, status, created_at, completed_at, status_updated_at)
SELECT h.contract_id, h.request_id, h.provider_id, h.customer_id, h.description, h.amount, 'ETB', 'completed', h.created_at, h.completed_at, h.completed_at
FROM seed_history h;

-- 5% platform fee, matching PLATFORM_FEE_PERCENT.
INSERT INTO escrow_ledger (id, contract_id, amount, currency, platform_fee, provider_payout, status, chapa_tx_ref, chapa_transfer_ref, created_at, held_at, released_at, updated_at)
SELECT
  h.ledger_id,
  h.contract_id,
  h.amount,
  'ETB',
  round(h.amount * 0.05, 2),
  h.amount - round(h.amount * 0.05, 2),
  'released',
  'zeyla-demo-tx-' || lpad(h.n::text, 4, '0'),
  'zeyla-demo-tr-' || lpad(h.n::text, 4, '0'),
  h.created_at,
  h.created_at + interval '12 minutes',
  h.completed_at + interval '5 minutes',
  h.completed_at + interval '5 minutes'
FROM seed_history h;

INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason, created_at)
SELECT
  h.contract_id,
  ev.from_status::contract_status,
  ev.to_status::contract_status,
  ev.actor,
  ev.reason,
  CASE WHEN ev.to_status = 'completed'
       THEN h.completed_at
       ELSE h.created_at + (ev.offset_minutes || ' minutes')::interval END
FROM seed_history h
CROSS JOIN (VALUES
  (NULL,              'awaiting_escrow', 'system',   'Contract created',                0),
  ('awaiting_escrow', 'escrowed',        'customer', 'Escrow funded via Chapa',        12),
  ('escrowed',        'active',          'provider', 'Provider started the job',       40),
  ('active',          'completed',       'provider', 'Work completed, escrow released', 0)
) AS ev(from_status, to_status, actor, reason, offset_minutes);

INSERT INTO reviews (id, contract_id, provider_id, reviewer_user_id, rating, comment, created_at)
SELECT
  h.review_id,
  h.contract_id,
  h.provider_id,
  h.customer_id,
  h.rating,
  CASE h.rating
    WHEN 5 THEN 'Arrived on time, clean work, would call again.'
    WHEN 4 THEN 'Good job overall, ran a little late.'
    WHEN 3 THEN 'Work is done but communication could be better.'
    WHEN 2 THEN 'Had to call someone else to finish it properly.'
    ELSE        'Did not complete the work as agreed.'
  END,
  h.completed_at + interval '2 hours'
FROM seed_history h
WHERE h.reviewed;

-- ---------------------------------------------------------------------------
-- Scenario 90 — live job, in progress, provider en route (tracking map)
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, voice_transcript, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444490', '11111111-1111-4111-8111-111111111101', 'electrician',
   'Power keeps tripping whenever the kitchen socket is used', 'high',
   8.9950, 38.7870, 'Bole Medhanialem', 'in_progress',
   'Kitchen socket keeps tripping the breaker, need an electrician today',
   now() - interval '70 minutes', now() - interval '20 minutes');

INSERT INTO contracts (id, request_id, provider_id, user_id, title, agreed_amount, currency, status, created_at, status_updated_at) VALUES
  ('33333333-3333-4333-8333-333333333390', '44444444-4444-4444-8444-444444444490',
   '22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101',
   'Kitchen circuit keeps tripping', 1200.00, 'ETB', 'active',
   now() - interval '62 minutes', now() - interval '20 minutes');

INSERT INTO escrow_ledger (id, contract_id, amount, currency, platform_fee, status, chapa_tx_ref, created_at, held_at, updated_at) VALUES
  ('77777777-7777-4777-8777-777777777790', '33333333-3333-4333-8333-333333333390',
   1200.00, 'ETB', 60.00, 'held', 'zeyla-demo-tx-0090',
   now() - interval '58 minutes', now() - interval '55 minutes', now() - interval '55 minutes');

INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason, created_at) VALUES
  ('33333333-3333-4333-8333-333333333390', NULL,              'awaiting_escrow', 'system',   'Contract created',          now() - interval '62 minutes'),
  ('33333333-3333-4333-8333-333333333390', 'awaiting_escrow', 'escrowed',        'customer', 'Escrow funded via Chapa',   now() - interval '55 minutes'),
  ('33333333-3333-4333-8333-333333333390', 'escrowed',        'active',          'provider', 'Provider started the job',  now() - interval '20 minutes');

-- Kalkidan is partway between her base and the customer.
UPDATE providers
   SET current_lat = 9.0005, current_lng = 38.7902, last_seen_at = now() - interval '40 seconds'
 WHERE user_id = '22222222-2222-4222-8222-222222222202';

-- ---------------------------------------------------------------------------
-- Scenario 91 — accepted and funded, provider has not started yet
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444491', '11111111-1111-4111-8111-111111111102', 'carpenter',
   'Fit new doors on the kitchen cabinets', 'normal', 9.0120, 38.7700, 'Kirkos, near Bambis', 'accepted',
   now() - interval '5 hours', now() - interval '4 hours');

INSERT INTO contracts (id, request_id, provider_id, user_id, title, agreed_amount, currency, status, created_at, status_updated_at) VALUES
  ('33333333-3333-4333-8333-333333333391', '44444444-4444-4444-8444-444444444491',
   '22222222-2222-4222-8222-222222222207', '11111111-1111-4111-8111-111111111102',
   'Kitchen cabinet doors', 3200.00, 'ETB', 'escrowed',
   now() - interval '4 hours', now() - interval '3 hours');

INSERT INTO escrow_ledger (id, contract_id, amount, currency, platform_fee, status, chapa_tx_ref, created_at, held_at, updated_at) VALUES
  ('77777777-7777-4777-8777-777777777791', '33333333-3333-4333-8333-333333333391',
   3200.00, 'ETB', 160.00, 'held', 'zeyla-demo-tx-0091',
   now() - interval '4 hours', now() - interval '3 hours', now() - interval '3 hours');

INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason, created_at) VALUES
  ('33333333-3333-4333-8333-333333333391', NULL,              'awaiting_escrow', 'system',   'Contract created',        now() - interval '4 hours'),
  ('33333333-3333-4333-8333-333333333391', 'awaiting_escrow', 'escrowed',        'customer', 'Escrow funded via Chapa', now() - interval '3 hours');

-- ---------------------------------------------------------------------------
-- Scenario 92 — checkout started, escrow not funded (the payment page)
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444492', '11111111-1111-4111-8111-111111111103', 'painter',
   'Repaint two bedrooms, walls and ceilings', 'low', 9.0330, 38.7530, 'Arada, Piassa', 'accepted',
   now() - interval '90 minutes', now() - interval '80 minutes');

INSERT INTO contracts (id, request_id, provider_id, user_id, title, agreed_amount, currency, status, created_at, status_updated_at) VALUES
  ('33333333-3333-4333-8333-333333333392', '44444444-4444-4444-8444-444444444492',
   '22222222-2222-4222-8222-222222222208', '11111111-1111-4111-8111-111111111103',
   'Repaint two bedrooms', 4800.00, 'ETB', 'awaiting_escrow',
   now() - interval '80 minutes', now() - interval '80 minutes');

INSERT INTO escrow_ledger (id, contract_id, amount, currency, platform_fee, status, chapa_tx_ref, checkout_url, created_at, updated_at) VALUES
  ('77777777-7777-4777-8777-777777777792', '33333333-3333-4333-8333-333333333392',
   4800.00, 'ETB', 240.00, 'pending', 'zeyla-demo-tx-0092',
   'https://checkout.chapa.co/checkout/payment/zeyla-demo-tx-0092',
   now() - interval '80 minutes', now() - interval '80 minutes');

INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason, created_at) VALUES
  ('33333333-3333-4333-8333-333333333392', NULL, 'awaiting_escrow', 'system', 'Contract created', now() - interval '80 minutes');

-- ---------------------------------------------------------------------------
-- Scenario 93 — open emergency request, pings fanned out and waiting
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, radius_meters, status, voice_transcript, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444493', '11111111-1111-4111-8111-111111111101', 'plumber',
   'Kitchen sink is blocked and water is backing up onto the floor', 'emergency',
   8.9950, 38.7870, 'Bole Medhanialem', 5000, 'pinged',
   'ወጥ ቤቱ ውስጥ ውሃ እየሞላ ነው፣ በአስቸኳይ ቧንቧ ሰራተኛ እፈልጋለሁ',
   now() - interval '4 minutes', now() - interval '2 minutes');

INSERT INTO pings (id, request_id, provider_id, status, distance_meters, trust_score_at_ping, sent_at, seen_at, responded_at, expires_at) VALUES
  ('88888888-8888-4888-8888-888888888801', '44444444-4444-4444-8444-444444444493', '22222222-2222-4222-8222-222222222201', 'sent',      312,  95, now() - interval '3 minutes', NULL,                         NULL,                         now() + interval '2 minutes'),
  ('88888888-8888-4888-8888-888888888802', '44444444-4444-4444-8444-444444444493', '22222222-2222-4222-8222-222222222206', 'seen',      897,  57, now() - interval '3 minutes', now() - interval '2 minutes', NULL,                         now() + interval '2 minutes'),
  ('88888888-8888-4888-8888-888888888803', '44444444-4444-4444-8444-444444444493', '22222222-2222-4222-8222-222222222205', 'declined', 6980,  63, now() - interval '3 minutes', now() - interval '3 minutes', now() - interval '2 minutes', now() + interval '2 minutes');

-- ---------------------------------------------------------------------------
-- Scenario 94 — disputed job, escrow still held
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444494', '11111111-1111-4111-8111-111111111104', 'plumber',
   'Install a new electric water heater', 'normal', 9.0290, 38.7150, 'Kolfe Keranio', 'in_progress',
   now() - interval '3 days', now() - interval '2 days');

INSERT INTO contracts (id, request_id, provider_id, user_id, title, agreed_amount, currency, status, created_at, status_updated_at) VALUES
  ('33333333-3333-4333-8333-333333333394', '44444444-4444-4444-8444-444444444494',
   '22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111104',
   'Water heater installation', 2600.00, 'ETB', 'disputed',
   now() - interval '3 days', now() - interval '2 days');

INSERT INTO escrow_ledger (id, contract_id, amount, currency, platform_fee, status, chapa_tx_ref, created_at, held_at, updated_at) VALUES
  ('77777777-7777-4777-8777-777777777794', '33333333-3333-4333-8333-333333333394',
   2600.00, 'ETB', 130.00, 'held', 'zeyla-demo-tx-0094',
   now() - interval '3 days', now() - interval '3 days', now() - interval '2 days');

INSERT INTO contract_events (contract_id, from_status, to_status, actor, reason, created_at) VALUES
  ('33333333-3333-4333-8333-333333333394', NULL,              'awaiting_escrow', 'system',   'Contract created',                     now() - interval '3 days'),
  ('33333333-3333-4333-8333-333333333394', 'awaiting_escrow', 'escrowed',        'customer', 'Escrow funded via Chapa',              now() - interval '3 days'),
  ('33333333-3333-4333-8333-333333333394', 'escrowed',        'active',          'provider', 'Provider started the job',             now() - interval '3 days'),
  ('33333333-3333-4333-8333-333333333394', 'active',          'disputed',        'customer', 'Heater leaks, customer opened dispute', now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- Scenarios 95 and 96 — a cancelled request and one still waiting on fan-out
-- ---------------------------------------------------------------------------

INSERT INTO service_requests (id, user_id, category, description, urgency, lat, lng, address_label, status, created_at, updated_at) VALUES
  ('44444444-4444-4444-8444-444444444495', '11111111-1111-4111-8111-111111111102', 'cleaner',
   'Deep clean before the landlord inspection', 'low', 9.0110, 38.7680, 'Kirkos', 'cancelled',
   now() - interval '2 days', now() - interval '2 days'),
  ('44444444-4444-4444-8444-444444444496', '11111111-1111-4111-8111-111111111103', 'mover',
   'Move a two bedroom flat from Piassa to Ayat', 'normal', 9.0340, 38.7520, 'Arada, Piassa', 'pending',
   now() - interval '9 minutes', now() - interval '9 minutes');

-- ---------------------------------------------------------------------------
-- Flags — what pushes Hanna to the bottom of discovery
-- ---------------------------------------------------------------------------

INSERT INTO flags (id, target_provider_id, reporter_user_id, contract_id, reason, status, created_at) VALUES
  ('66666666-6666-4666-8666-666666666601', '22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111101', NULL, 'Quoted one price, charged another on arrival', 'open',      now() - interval '8 days'),
  ('66666666-6666-4666-8666-666666666602', '22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111102', NULL, 'Did not show up and stopped answering',        'upheld',    now() - interval '5 days'),
  ('66666666-6666-4666-8666-666666666603', '22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111104', '33333333-3333-4333-8333-333333333394', 'Heater was installed badly and leaks', 'open', now() - interval '2 days'),
  -- Dismissed, so the formula must ignore it — proves the flag filter works.
  ('66666666-6666-4666-8666-666666666604', '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111104', NULL, 'Wrong provider reported by mistake',            'dismissed', now() - interval '11 days');

-- ---------------------------------------------------------------------------
-- Notifications — a populated feed with a couple still unread
-- ---------------------------------------------------------------------------

INSERT INTO notifications (id, user_id, type, title, body, data, read_at, created_at) VALUES
  ('99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111101', 'ping_accepted',   'Kalkidan Alemu accepted your job', 'She is on the way to Bole Medhanialem.', '{"contractId":"33333333-3333-4333-8333-333333333390"}', NULL,                          now() - interval '58 minutes'),
  ('99999999-9999-4999-8999-999999999902', '11111111-1111-4111-8111-111111111101', 'escrow_held',     'Payment held in escrow',           '1,200 ETB is held until you confirm the job is done.', '{"contractId":"33333333-3333-4333-8333-333333333390"}', now() - interval '50 minutes', now() - interval '55 minutes'),
  ('99999999-9999-4999-8999-999999999903', '11111111-1111-4111-8111-111111111101', 'job_started',     'Kalkidan Alemu started the job',   'Track her arrival on the map.', '{"contractId":"33333333-3333-4333-8333-333333333390"}', NULL,                          now() - interval '20 minutes'),
  ('99999999-9999-4999-8999-999999999904', '22222222-2222-4222-8222-222222222201', 'ping_received',   'New emergency job nearby',         'Blocked kitchen sink, 312 m away in Bole.', '{"requestId":"44444444-4444-4444-8444-444444444493"}', NULL,                          now() - interval '3 minutes'),
  ('99999999-9999-4999-8999-999999999905', '22222222-2222-4222-8222-222222222206', 'ping_received',   'New emergency job nearby',         'Blocked kitchen sink, 897 m away in Bole.', '{"requestId":"44444444-4444-4444-8444-444444444493"}', now() - interval '2 minutes', now() - interval '3 minutes'),
  ('99999999-9999-4999-8999-999999999906', '22222222-2222-4222-8222-222222222207', 'escrow_held',     'Payment secured for your job',     '3,200 ETB is in escrow. You can start whenever you are ready.', '{"contractId":"33333333-3333-4333-8333-333333333391"}', NULL,                          now() - interval '3 hours'),
  ('99999999-9999-4999-8999-999999999907', '22222222-2222-4222-8222-222222222205', 'flag_received',   'A customer opened a dispute',      'Water heater installation is under review.', '{"contractId":"33333333-3333-4333-8333-333333333394"}', now() - interval '1 day',      now() - interval '2 days'),
  ('99999999-9999-4999-8999-999999999908', '11111111-1111-4111-8111-111111111103', 'payment_pending', 'Finish your payment',              'Your booking with Beti Paint & Finish is waiting on escrow.', '{"contractId":"33333333-3333-4333-8333-333333333392"}', NULL,                          now() - interval '75 minutes');

-- ---------------------------------------------------------------------------
-- Trust scores — same formula as trust.service.ts, applied to the seeded facts
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_trust ON COMMIT DROP AS
WITH inputs AS (
  SELECT
    p.user_id       AS provider_id,
    p.trust_score   AS previous_score,
    p.firecrawl_profile_match,
    (SELECT count(*) FROM contracts c WHERE c.provider_id = p.user_id AND c.status = 'completed') AS completed_contracts,
    (SELECT avg(r.rating) FROM reviews r WHERE r.provider_id = p.user_id)                          AS avg_rating,
    (SELECT count(*) FROM flags f WHERE f.target_provider_id = p.user_id AND f.status <> 'dismissed') AS flags_received,
    (
      u.kyc_status IN ('verified', 'manual_review')
      OR (u.kyc_status = 'pending' AND u.id_doc_url IS NOT NULL AND u.selfie_url IS NOT NULL)
    ) AS kyc_submitted
  FROM providers p
  JOIN users u ON u.id = p.user_id
  WHERE p.user_id::text LIKE '22222222-2222-4222-8222-%'
)
SELECT
  i.provider_id,
  i.previous_score,
  50::numeric                                                        AS base,
  least(i.completed_contracts * 2, 20)::numeric                      AS completed_points,
  CASE WHEN i.avg_rating IS NULL THEN 0
       ELSE ((i.avg_rating - 1) / 4) * 20 END::numeric               AS review_bonus,
  CASE WHEN i.kyc_submitted THEN 10 ELSE 0 END::numeric              AS kyc_bonus,
  CASE WHEN i.firecrawl_profile_match THEN 5 ELSE 0 END::numeric     AS firecrawl_bonus,
  (i.flags_received * -5)::numeric                                   AS flag_penalty
FROM inputs i;

ALTER TABLE seed_trust ADD COLUMN total numeric;
UPDATE seed_trust
   SET total = greatest(
     0,
     round(base + completed_points + review_bonus + kyc_bonus + firecrawl_bonus + flag_penalty, 2)
   );

UPDATE providers p
   SET trust_score = t.total
  FROM seed_trust t
 WHERE p.user_id = t.provider_id;

-- A recompute that changes nothing writes no row, exactly like the service.
INSERT INTO trust_score_log (provider_id, delta, reason, previous_score, new_score, breakdown, created_at)
SELECT
  t.provider_id,
  t.total - t.previous_score,
  'seed:marketplace_demo',
  t.previous_score,
  t.total,
  jsonb_build_object(
    'base',               t.base,
    'completedContracts', t.completed_points,
    'reviewBonus',        t.review_bonus,
    'kycBonus',           t.kyc_bonus,
    'firecrawlBonus',     t.firecrawl_bonus,
    'flagPenalty',        t.flag_penalty,
    'total',              t.total
  ),
  now() - interval '1 minute'
FROM seed_trust t
WHERE t.total <> t.previous_score;

-- Ping snapshots were written before the scores existed; line them back up.
UPDATE pings pg
   SET trust_score_at_ping = p.trust_score
  FROM providers p
 WHERE p.user_id = pg.provider_id
   AND pg.id::text LIKE '88888888-8888-4888-8888-%';

COMMIT;
