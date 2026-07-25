/**
 * Mock-OTP login for the smoke suites.
 *
 * Seed phones (see apps/api/db/seeds/marketplace_demo.sql):
 *   Sara (customer)  +251911000001
 *   Yonas (customer) +251911000002
 *   Abebe (provider) +251911000101
 *   Hanna (provider) +251911000106
 *
 * Requires AUTH_OTP_PROVIDER=mock so /otp/request returns `devCode`.
 */

const PHONES = {
  customer: "+251911000001",
  yonas: "+251911000002",
  abebe: "+251911000101",
  kalkidan: "+251911000102",
  dawit: "+251911000103",
  meron: "+251911000104",
  tesfaye: "+251911000105",
  hanna: "+251911000106",
};

export { PHONES };

const tokenCache = new Map();

export async function login(apiBase, phone) {
  const cached = tokenCache.get(phone);
  if (cached) return cached;

  const request = await fetch(`${apiBase}/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const requested = await request.json();
  if (!request.ok || !requested.data?.devCode) {
    throw new Error(
      `otp/request failed for ${phone}: ${JSON.stringify(requested)}`,
    );
  }

  const verify = await fetch(`${apiBase}/auth/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code: requested.data.devCode }),
  });
  const verified = await verify.json();
  if (!verify.ok || !verified.data?.token) {
    throw new Error(
      `otp/verify failed for ${phone}: ${JSON.stringify(verified)}`,
    );
  }

  tokenCache.set(phone, verified.data.token);
  return verified.data.token;
}

/** Shared fetch wrapper — Authorization: Bearer, never x-user-id. */
export function makeApi(apiBase) {
  return async function api(method, path, { token, body } = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };
}
