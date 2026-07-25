/**
 * Contract, escrow, request and auth-user shapes are real — import them from
 * @zeyla/shared (see docs/api/identity-money.md and
 * apps/api/src/modules/marketplace/API.md) rather than re-declaring.
 *
 * Booking below is a local view-model: the flattened bits of a service request,
 * its accepted provider, and the agreed price that this page needs to render a
 * summary and create a contract.
 */

export type Booking = {
  requestId: string;
  providerId: string;
  /** Falls back to a generic label when the provider lookup fails. */
  providerName: string;
  /** Category slug from the request, e.g. "plumber". */
  category: string;
  description: string;
  addressLabel: string | null;
  /**
   * Agreed price. Zero means "nobody has told us the price" — no endpoint
   * carries it yet, so the customer confirms it on this page. See the
   * TODO(mohammed) in useBooking.ts.
   */
  amount: number;
  currency: string;
};
