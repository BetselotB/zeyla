import { useEffect, useState } from "react";
import { getProvider, getServiceRequest } from "./api";
import type { Booking } from "./types";

export type BookingState =
  | "loading"
  /** Ready to pay: request is accepted and we know who took it. */
  | "ready"
  /** Request exists but no provider has accepted yet — nothing to fund. */
  | "not-accepted"
  /** No requestId in the URL at all. */
  | "missing"
  | "error";

type BookingResult = {
  state: BookingState;
  booking: Booking | null;
};

/**
 * A starting figure from the provider's published range — the midpoint,
 * rounded to the nearest 10 birr so it reads as an estimate rather than as a
 * precise quote nobody actually gave. Zero when they have published no range,
 * which leaves the field empty for the customer to fill in.
 */
function suggestedAmount(min: number | null, max: number | null): number {
  const low = min ?? max;
  const high = max ?? min;
  if (low === null || high === null || high <= 0) return 0;
  return Math.round((low + high) / 2 / 10) * 10;
}

/**
 * Resolves what's being paid for from the URL.
 *
 * The hand-off is `?requestId=…` (plus optional `providerId`), matching the
 * convention the tracking page already uses, since accepting a ping does not
 * create a contract — the customer side starts escrow, so this page is entered
 * with the accepted request and derives the rest from the API rather than
 * trusting display values passed in a query string.
 *
 * No endpoint carries a per-job quote — accepting a ping deliberately does not
 * set one — so the amount is seeded from the midpoint of the provider's own
 * published price range and the customer confirms or edits it. An explicit
 * `?amount=` hint always wins. If a real quote field ever lands on the request
 * or the ping, read it here in preference to both.
 */
export function useBooking(params: URLSearchParams): BookingResult {
  const requestId = params.get("requestId");
  const providerIdHint = params.get("providerId");
  const amountHint = Number(params.get("amount") ?? 0);
  const currency = params.get("currency") ?? "ETB";

  const [result, setResult] = useState<BookingResult>(() => ({
    state: requestId ? "loading" : "missing",
    booking: null,
  }));

  useEffect(() => {
    if (!requestId) {
      setResult({ state: "missing", booking: null });
      return;
    }

    let isCancelled = false;

    async function resolve() {
      try {
        const { request, pings } = await getServiceRequest(requestId!);
        if (isCancelled) return;

        const acceptedPing = pings.find((ping) => ping.status === "accepted");
        const providerId = acceptedPing?.providerId ?? providerIdHint;

        if (!providerId || request.status !== "accepted") {
          setResult({ state: "not-accepted", booking: null });
          return;
        }

        // Best-effort: a missing profile shouldn't block payment.
        let providerName = "Your provider";
        let suggested = 0;
        try {
          const provider = await getProvider(providerId);
          if (provider.name) providerName = provider.name;
          suggested = suggestedAmount(provider.priceMin, provider.priceMax);
        } catch {
          /* keep the fallback label and let the customer type the amount */
        }
        if (isCancelled) return;

        setResult({
          state: "ready",
          booking: {
            requestId: requestId!,
            providerId,
            providerName,
            category: request.category,
            description: request.description ?? "",
            addressLabel: request.addressLabel,
            amount: amountHint > 0 ? amountHint : suggested,
            currency,
          },
        });
      } catch {
        if (!isCancelled) setResult({ state: "error", booking: null });
      }
    }

    resolve();
    return () => {
      isCancelled = true;
    };
  }, [requestId, providerIdHint, amountHint, currency]);

  return result;
}
