import { PagePlaceholder } from "../../components";

/**
 * Reviews — leave a review after completion, flag a counterparty, show trust score.
 * Talks to: POST /api/trust/reviews, POST /api/trust/flags, GET /api/trust/preview
 */
export function ReviewsPage() {
  return (
    <PagePlaceholder
      title="Reviews"
      owner="Daniel"
      folder="apps/web/src/pages/reviews"
    >
      <ul>
        <li>Star rating + comment, only on completed contracts</li>
        <li>Flag a counterparty</li>
        <li>Trust score breakdown display</li>
      </ul>
    </PagePlaceholder>
  );
}
