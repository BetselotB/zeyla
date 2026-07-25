/**
 * Contract, escrow, and auth-user shapes are real — import them from
 * @zeyla/shared (see docs/api/identity-money.md) rather than re-declaring.
 * Only booking-summary data below is local: it's a deep-link contract from
 * the (not-yet-built) discovery/booking flow, not a real API shape.
 */

export type BookingSummaryData = {
  providerId: string;
  providerName: string;
  description: string;
  amount: number;
  currency: string;
};
