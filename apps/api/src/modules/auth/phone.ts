/**
 * Phone numbers arrive from the UI as "0911223344", "251911223344" or
 * "+251 911 22 33 44". They are the account's unique key, so they have to
 * collapse to one canonical E.164 string before they touch the database.
 */

const ETHIOPIA_COUNTRY_CODE = "251";

export class InvalidPhoneError extends Error {
  constructor() {
    super("invalid_phone");
  }
}

export function normalisePhone(input: unknown): string {
  if (typeof input !== "string") throw new InvalidPhoneError();

  const cleaned = input.replace(/[\s()\-.]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) throw new InvalidPhoneError();

  const digits = cleaned.replace(/^\+/, "");

  // 0911223344 -> +251911223344
  if (digits.startsWith("0")) {
    return `+${ETHIOPIA_COUNTRY_CODE}${digits.slice(1)}`;
  }
  // 911223344 -> +251911223344
  if (digits.length === 9 && !cleaned.startsWith("+")) {
    return `+${ETHIOPIA_COUNTRY_CODE}${digits}`;
  }
  return `+${digits}`;
}
