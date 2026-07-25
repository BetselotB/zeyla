import { PagePlaceholder } from "../../components";

/**
 * Payment — fund escrow via Chapa, watch contract status, release on completion.
 * Talks to: POST /api/escrow/contracts, GET /api/escrow/state-machine
 */
export function PaymentPage() {
  return (
    <PagePlaceholder
      title="Payment"
      owner="Maramawit"
      folder="apps/web/src/pages/payment"
    >
      <ul>
        <li>Fund escrow via Chapa checkout</li>
        <li>Poll or subscribe to contract status</li>
        <li>Release funds when work is marked complete</li>
      </ul>
    </PagePlaceholder>
  );
}
