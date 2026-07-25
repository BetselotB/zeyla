import type {
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileResponse,
  SubCity,
} from "@zeyla/shared";
import { pool, query } from "../../db/client.js";
import { recomputeTrustScore } from "../trust/trust.service.js";
import type { Actor } from "./lib/actor.js";

/**
 * Provider profile creation — the last step of onboarding.
 *
 * Discovery filters on `providers.location` with a PostGIS radius search, so a
 * profile without coordinates is invisible no matter how good it is. The form
 * asks for a sub-city rather than a pin, so the centroids below stand in until
 * the provider shares a real location from the tracking screen.
 */
const SUB_CITY_CENTROIDS: Record<SubCity, { lat: number; lng: number }> = {
  "Addis Ketema": { lat: 9.0384, lng: 38.7395 },
  "Akaky Kaliti": { lat: 8.8833, lng: 38.7833 },
  Arada: { lat: 9.0378, lng: 38.7614 },
  Bole: { lat: 8.9944, lng: 38.7889 },
  Gullele: { lat: 9.0722, lng: 38.7392 },
  Kirkos: { lat: 9.0089, lng: 38.7614 },
  "Kolfe Keranio": { lat: 9.0264, lng: 38.6931 },
  Lideta: { lat: 9.0128, lng: 38.7328 },
  "Nifas Silk-Lafto": { lat: 8.9639, lng: 38.7333 },
  Yeka: { lat: 9.0472, lng: 38.8069 },
};

interface ProviderProfileRow {
  user_id: string;
  category: string;
  business_name: string | null;
  sub_city: string | null;
  bio: string | null;
  experience_years: number | null;
  price_min: string | null;
  price_max: string | null;
  contact_phone: string | null;
  service_radius_meters: number;
  trust_score: string;
  is_online: boolean;
  lat: number | null;
  lng: number | null;
}

const PROFILE_SELECT = `
  p.user_id, p.category, p.business_name, p.sub_city, p.bio,
  p.experience_years, p.price_min, p.price_max, p.contact_phone,
  p.service_radius_meters, p.trust_score, p.is_online,
  ST_Y(p.location::geometry) AS lat,
  ST_X(p.location::geometry) AS lng`;

function toProfile(
  row: ProviderProfileRow,
  usedCentroid: boolean,
): ProviderProfile {
  return {
    providerId: row.user_id,
    category: row.category,
    businessName: row.business_name,
    subCity: row.sub_city,
    bio: row.bio,
    experienceYears: row.experience_years ?? 0,
    priceMin: row.price_min === null ? null : Number(row.price_min),
    priceMax: row.price_max === null ? null : Number(row.price_max),
    contactPhone: row.contact_phone,
    serviceRadiusMeters: row.service_radius_meters,
    trustScore: Number(row.trust_score),
    isOnline: row.is_online,
    lat: row.lat,
    lng: row.lng,
    createdFromSubCityCentroid: usedCentroid,
  };
}

/**
 * Creates or updates the caller's own provider profile, promoting them to the
 * `provider` role in the same transaction so they can never end up listed in
 * discovery while still typed as a customer.
 *
 * Idempotent by design: the onboarding form can be resubmitted after a failed
 * request without producing a second identity.
 */
export async function upsertProviderProfile(
  actor: Actor,
  input: ProviderProfileInput,
): Promise<ProviderProfileResponse> {
  const centroid = SUB_CITY_CENTROIDS[input.subCity];
  const usedCentroid = input.lat === undefined || input.lng === undefined;
  const lat = usedCentroid ? centroid.lat : input.lat;
  const lng = usedCentroid ? centroid.lng : input.lng;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ user_id: string }>(
      "SELECT user_id FROM providers WHERE user_id = $1::uuid FOR UPDATE",
      [actor.userId],
    );
    const created = existing.rows.length === 0;

    // base_lat/base_lng are enough: the providers_sync_location trigger from
    // 003 fills the indexed geography column from them.
    await client.query(
      `INSERT INTO providers (
         user_id, category, business_name, sub_city, bio, experience_years,
         price_min, price_max, contact_phone, service_radius_meters,
         base_lat, base_lng
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6::int, $7::numeric, $8::numeric,
               $9, $10::int, $11::float8, $12::float8)
       ON CONFLICT (user_id) DO UPDATE
         SET category = EXCLUDED.category,
             business_name = EXCLUDED.business_name,
             sub_city = EXCLUDED.sub_city,
             bio = EXCLUDED.bio,
             experience_years = EXCLUDED.experience_years,
             price_min = EXCLUDED.price_min,
             price_max = EXCLUDED.price_max,
             contact_phone = EXCLUDED.contact_phone,
             service_radius_meters = EXCLUDED.service_radius_meters,
             base_lat = EXCLUDED.base_lat,
             base_lng = EXCLUDED.base_lng`,
      [
        actor.userId,
        input.category,
        input.businessName,
        input.subCity,
        input.bio,
        input.experienceYears,
        input.priceMin,
        input.priceMax,
        input.contactPhone ?? null,
        input.serviceRadiusMeters ?? 10_000,
        lat,
        lng,
      ],
    );

    await client.query(
      `UPDATE users
          SET role = 'provider',
              name = COALESCE($2, name),
              updated_at = now()
        WHERE id = $1::uuid`,
      [actor.userId, input.fullName?.trim() || null],
    );

    // The formula credits a submitted KYC, so a provider who verified during
    // onboarding must not sit on the default 50 until their first review.
    await recomputeTrustScore(
      actor.userId,
      created ? "provider_profile_created" : "provider_profile_updated",
      client,
    );

    await client.query("COMMIT");

    const result = await query<ProviderProfileRow>(
      `SELECT ${PROFILE_SELECT} FROM providers p WHERE p.user_id = $1::uuid`,
      [actor.userId],
    );
    return { provider: toProfile(result.rows[0]!, usedCentroid), created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** The caller's own profile, or null if they have not created one. */
export async function getOwnProviderProfile(
  actor: Actor,
): Promise<ProviderProfile | null> {
  const result = await query<ProviderProfileRow>(
    `SELECT ${PROFILE_SELECT} FROM providers p WHERE p.user_id = $1::uuid`,
    [actor.userId],
  );
  const row = result.rows[0];
  return row ? toProfile(row, false) : null;
}
