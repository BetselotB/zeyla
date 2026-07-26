import { useEffect, useState } from "react";
import type { NearbyAvailability } from "@zeyla/shared";
import { getNearbyAvailability } from "../../provider/lib/api.js";
import { getCoords } from "../lib/geo.js";

/** Re-checked often enough that a provider going online shows up mid-visit. */
const POLL_MS = 30_000;

/**
 * The customer-facing half of the availability switch.
 *
 * Providers going on and off duty is invisible to a customer until something
 * says so, and "we found 8 plumbers" reads very differently at 2am than it does
 * at noon. This states plainly how many of them can actually be reached right
 * now, before the customer spends a minute describing their problem.
 */
export function LiveAvailability({ category }: { category?: string }) {
  const [data, setData] = useState<NearbyAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { lat, lng } = await getCoords();
        const next = await getNearbyAvailability({ lat, lng, category });
        if (!cancelled) setData(next);
      } catch {
        // Location denied or the endpoint is down. Saying nothing is better
        // than claiming nobody is available.
        if (!cancelled) setData(null);
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [category]);

  if (!data || data.total === 0) return null;

  const { online, total, nearestOnlineMeters } = data;
  const nearest =
    nearestOnlineMeters === null
      ? null
      : nearestOnlineMeters < 1000
        ? `${Math.round(nearestOnlineMeters / 100) * 100} m`
        : `${(nearestOnlineMeters / 1000).toFixed(1)} km`;

  return (
    <p className={`z-live-availability${online === 0 ? " is-empty" : ""}`}>
      <span className="z-live-availability__dot" aria-hidden="true" />
      {online === 0 ? (
        <>
          None of the {total} providers near you are online right now. You can
          still describe the job — we'll ping them as soon as someone comes on.
        </>
      ) : (
        <>
          <strong>{online}</strong> of {total} providers near you{" "}
          {online === 1 ? "is" : "are"} online right now
          {nearest && <> · closest {nearest} away</>}
        </>
      )}
    </p>
  );
}
