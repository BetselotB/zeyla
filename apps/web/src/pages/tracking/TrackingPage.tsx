import { PagePlaceholder } from "../../components";

/**
 * Tracking — live provider location over Socket.io while contract is active.
 * Listens on: join:contract, contract:location
 */
export function TrackingPage() {
  return (
    <PagePlaceholder
      title="Tracking"
      owner="Daniel"
      folder="apps/web/src/pages/tracking"
    >
      <ul>
        <li>Join the contract socket room</li>
        <li>Animate provider location on the map</li>
        <li>Fall back to an animated fixed route in demo mode</li>
      </ul>
    </PagePlaceholder>
  );
}
