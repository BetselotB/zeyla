import type {
  ProviderDetail,
  ProviderReviewSummary,
  ProviderSearchQuery,
  ProviderSearchResult,
  ProviderSummary,
} from "@zeyla/shared";
import { query } from "../../db/client.js";
import { ApiError } from "./lib/errors.js";

interface ProviderRow {
  id: string;
  name: string | null;
  category: string;
  bio: string | null;
  experience_years: number | null;
  trust_score: string;
  is_online: boolean;
  kyc_status: string;
  firecrawl_profile_match: boolean;
  lat: number | null;
  lng: number | null;
  distance_meters: string | number | null;
  avg_rating: string | null;
  review_count: string;
  completed_contracts: string;
  last_seen_at: Date | null;
  total_count?: string;
}

/**
 * Columns every provider projection shares. `$1` is always the origin point, so
 * distance is available to both search and detail without a second round trip.
 */
const PROVIDER_SELECT = `
  p.user_id                     AS id,
  u.name                        AS name,
  p.category                    AS category,
  p.bio                         AS bio,
  p.experience_years            AS experience_years,
  p.trust_score                 AS trust_score,
  p.is_online                   AS is_online,
  u.kyc_status                  AS kyc_status,
  p.firecrawl_profile_match     AS firecrawl_profile_match,
  ST_Y(p.location::geometry)    AS lat,
  ST_X(p.location::geometry)    AS lng,
  COALESCE(r.avg_rating, NULL)  AS avg_rating,
  COALESCE(r.review_count, 0)   AS review_count,
  COALESCE(c.completed, 0)      AS completed_contracts,
  p.last_seen_at                AS last_seen_at`;

const PROVIDER_JOINS = `
  JOIN users u ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT AVG(rating)::numeric(4,2) AS avg_rating, COUNT(*) AS review_count
      FROM reviews rv
     WHERE rv.provider_id = p.user_id
  ) r ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS completed
      FROM contracts ct
     WHERE ct.provider_id = p.user_id AND ct.status = 'completed'
  ) c ON TRUE`;

/** Whitelist — never interpolate a caller-supplied sort into SQL. */
const ORDER_BY: Record<ProviderSearchQuery["sort"], string> = {
  trust: "p.trust_score DESC, distance_meters ASC",
  distance: "distance_meters ASC, p.trust_score DESC",
};

function toProviderSummary(row: ProviderRow): ProviderSummary {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    bio: row.bio,
    experienceYears: row.experience_years ?? 0,
    trustScore: Number(row.trust_score),
    isOnline: row.is_online,
    kycStatus: row.kyc_status,
    firecrawlVerified: row.firecrawl_profile_match,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    distanceMeters: Math.round(Number(row.distance_meters ?? 0)),
    avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
    reviewCount: Number(row.review_count),
    completedContracts: Number(row.completed_contracts),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
  };
}

/**
 * Radius search. ST_DWithin on the geography column hits the GiST index, so the
 * distance/rating work only runs on providers already inside the circle.
 */
export async function searchProviders(
  params: ProviderSearchQuery,
): Promise<ProviderSearchResult> {
  const sql = `
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography AS g
    )
    SELECT ${PROVIDER_SELECT},
           ST_Distance(p.location, o.g) AS distance_meters,
           COUNT(*) OVER ()             AS total_count
      FROM providers p
      CROSS JOIN origin o
      ${PROVIDER_JOINS}
     WHERE p.location IS NOT NULL
       AND ST_DWithin(p.location, o.g, $3::float8)
       AND ($4::text IS NULL OR lower(p.category) = lower($4::text))
       AND p.trust_score >= $5::numeric
       AND ($6::boolean = false OR p.is_online = true)
       AND ($7::text IS NULL OR u.name ILIKE '%' || $7::text || '%'
                              OR p.bio  ILIKE '%' || $7::text || '%')
     ORDER BY ${ORDER_BY[params.sort]}
     LIMIT $8::int OFFSET $9::int`;

  const result = await query<ProviderRow>(sql, [
    params.lng,
    params.lat,
    params.radiusMeters,
    params.category,
    params.minTrust,
    params.onlineOnly,
    params.q,
    params.limit,
    params.offset,
  ]);

  return {
    providers: result.rows.map(toProviderSummary),
    total: Number(result.rows[0]?.total_count ?? 0),
    query: params,
  };
}

/**
 * Single provider. `origin` is optional — pass the customer's point to get a
 * real distance, omit it and distanceMeters comes back as 0.
 */
export async function getProviderDetail(
  providerId: string,
  origin?: { lat: number; lng: number } | null,
): Promise<ProviderDetail> {
  const sql = `
    WITH origin AS (
      SELECT ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography AS g
    )
    SELECT ${PROVIDER_SELECT},
           CASE
             WHEN o.g IS NULL OR p.location IS NULL THEN 0
             ELSE ST_Distance(p.location, o.g)
           END AS distance_meters
      FROM providers p
      CROSS JOIN origin o
      ${PROVIDER_JOINS}
     WHERE p.user_id = $1::uuid`;

  const result = await query<ProviderRow>(sql, [
    providerId,
    origin?.lng ?? null,
    origin?.lat ?? null,
  ]);

  const row = result.rows[0];
  if (!row) throw ApiError.notFound("provider");

  const reviews = await query<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: Date;
  }>(
    `SELECT id, rating, comment, created_at
       FROM reviews
      WHERE provider_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 5`,
    [providerId],
  );

  const recentReviews: ProviderReviewSummary[] = reviews.rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at.toISOString(),
  }));

  return { ...toProviderSummary(row), recentReviews };
}

/** True when the provider row exists. Used before pinging or contracting. */
export async function providerExists(providerId: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    "SELECT true AS exists FROM providers WHERE user_id = $1::uuid",
    [providerId],
  );
  return result.rows.length > 0;
}
