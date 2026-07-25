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
 * Resolves what's being paid for from the URL.
 *
 * The hand-off is `?requestId=…` (plus optional `providerId`), matching the
 * convention the tracking page already uses, since accepting a ping does not
 * create a contract — the customer side starts escrow, so this page is entered
 * with the accepted request and derives the rest from the API rather than
 * trusting display values passed in a query string.
 *
 * TODO(mohammed): no endpoint carries an agreed price — ServiceRequestDto has
 * no amount field and accepting a ping doesn't set one — so `amount` is 0 here
 * unless an `?amount=` hint is passed, and the customer confirms it on the page.
 * If a quote/price field lands on the request or ping, read it here instead.
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

        // Best-effort: a missing name shouldn't block payment.
        let providerName = "Your provider";
        try {
          const provider = await getProvider(providerId);
          if (provider.name) providerName = provider.name;
        } catch {
          /* keep the fallback label */
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
            amount: amountHint > 0 ? amountHint : 0,
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
