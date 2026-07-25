/**
 * Where the customer is.
 *
 * The backend matches on these coordinates, not on the neighbourhood the
 * customer said out loud, so they have to be real. Device GPS is asked for
 * first; when it is refused or unavailable we fall back to the centre of Addis
 * Ababa and say so, because a radius search from a plausible point still shows
 * providers whereas no point at all shows an error.
 */
export interface Coords {
  lat: number;
  lng: number;
  /** False when this is the city-centre fallback rather than the device. */
  precise: boolean;
}

/** Meskel Square. */
const ADDIS_CENTRE: Coords = { lat: 9.0107, lng: 38.7612, precise: false };

const GPS_TIMEOUT_MS = 8_000;

export async function getCoords(): Promise<Coords> {
  if (!navigator.geolocation) return ADDIS_CENTRE;

  return new Promise((resolve) => {
    // Resolve, never reject: a denied permission prompt is a normal outcome and
    // must not stop the customer from finding a plumber.
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          precise: true,
        }),
      () => resolve(ADDIS_CENTRE),
      { timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}
