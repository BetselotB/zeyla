import { useEffect, useState } from "react";
import type { DemandSnapshot, ProviderAvailability } from "@zeyla/shared";
import { formatRadius } from "../lib/format";

interface ServiceAreaProps {
  availability: ProviderAvailability;
  demand: DemandSnapshot;
  isPending: boolean;
  isLocating: boolean;
  onRadiusChange: (meters: number) => void;
  onUseCurrentLocation: () => void;
}

const MIN_RADIUS = 1_000;
const MAX_RADIUS = 25_000;
const STEP = 500;

/**
 * Where the provider works, and what is happening there.
 *
 * The radius is the other half of the availability switch: being online only
 * means anything relative to an area, and a provider who never widens it will
 * quietly see less work than one who does. Pairing the control with live demand
 * makes that cause and effect visible instead of guessed at.
 */
export function ServiceArea({
  availability,
  demand,
  isPending,
  isLocating,
  onRadiusChange,
  onUseCurrentLocation,
}: ServiceAreaProps) {
  // Track the slider locally so dragging stays smooth; the commit happens on
  // release rather than on every intermediate pixel.
  const [draft, setDraft] = useState(availability.serviceRadiusMeters);
  useEffect(() => {
    setDraft(availability.serviceRadiusMeters);
  }, [availability.serviceRadiusMeters]);

  const hasLocation = availability.lat !== null && availability.lng !== null;

  return (
    <section className="pv-panel">
      <header className="pv-panel__head">
        <h2 className="pv-panel__title">Your service area</h2>
        <span className="pv-panel__value">{formatRadius(draft)}</span>
      </header>

      <input
        className="pv-range"
        type="range"
        min={MIN_RADIUS}
        max={MAX_RADIUS}
        step={STEP}
        value={draft}
        disabled={isPending}
        aria-label="Service radius"
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => draft !== availability.serviceRadiusMeters && onRadiusChange(draft)}
        onKeyUp={() => draft !== availability.serviceRadiusMeters && onRadiusChange(draft)}
      />
      <div className="pv-range__scale" aria-hidden="true">
        <span>{formatRadius(MIN_RADIUS)}</span>
        <span>{formatRadius(MAX_RADIUS)}</span>
      </div>

      <button
        type="button"
        className="z-btn z-btn-ghost pv-panel__button"
        disabled={isLocating || isPending}
        onClick={onUseCurrentLocation}
      >
        {isLocating ? "Finding you…" : "Update to my current location"}
      </button>

      {!hasLocation && (
        <p className="pv-panel__warn">
          We don't have a location for you yet, so customers can't find you in a
          radius search. Set one above.
        </p>
      )}

      <div className="pv-demand">
        <div className="pv-demand__row">
          <span className="pv-demand__value">{demand.openRequests}</span>
          <span className="pv-demand__label">
            open {demand.openRequests === 1 ? "request" : "requests"} in your trade and
            area right now
          </span>
        </div>
        <div className="pv-demand__row">
          <span className="pv-demand__value">{demand.competingProviders}</span>
          <span className="pv-demand__label">
            other {demand.competingProviders === 1 ? "provider" : "providers"} online
            covering the same area
          </span>
        </div>

        {availability.status === "offline" && demand.openRequests > 0 && (
          <p className="pv-demand__nudge">
            You're offline, so none of these can reach you.
          </p>
        )}
      </div>
    </section>
  );
}
