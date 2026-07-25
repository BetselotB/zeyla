import { PagePlaceholder } from "../../components";

/**
 * Discovery — provider list + Leaflet map, radius search, ping a provider.
 * Talks to: GET /api/marketplace/providers, POST /api/marketplace/requests
 */
export function DiscoveryPage() {
  return (
    <PagePlaceholder
      title="Discovery"
      owner="Daniel"
      folder="apps/web/src/pages/discovery"
    >
      <ul>
        <li>Nearby providers sorted by trust score</li>
        <li>Leaflet map with radius filter</li>
        <li>Ping a provider to start a request</li>
      </ul>
    </PagePlaceholder>
  );
}
