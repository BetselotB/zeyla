import type { ProviderShiftStats } from "@zeyla/shared";
import { formatEtb } from "../lib/format";

/**
 * Total money, as the provider thinks about it.
 *
 * Three numbers and no chrome, because the honest answer to "how am I doing"
 * is what has actually landed, what is still in escrow, and what the customers
 * thought of the work. Anything else here would be decoration on top of the
 * only figures that decide whether a provider keeps using Zeyla.
 */
export function EarningsPanel({ stats }: { stats: ProviderShiftStats }) {
  const lifetimeAverage =
    stats.completedTotal > 0 ? stats.earnedTotalEtb / stats.completedTotal : 0;

  return (
    <section className="pv-earn" id="earnings" aria-label="Earnings">
      <header className="pv-earn__head">
        <div>
          <span className="pv-earn__label">Total earned</span>
          <p className="pv-earn__total">{formatEtb(stats.earnedTotalEtb)}</p>
          <span className="pv-earn__sub">
            across {stats.completedTotal}{" "}
            {stats.completedTotal === 1 ? "completed job" : "completed jobs"}
            {stats.completedTotal > 0 && ` · ${formatEtb(lifetimeAverage)} average`}
          </span>
        </div>
        <span className="pv-earn__badge">Paid out by Zeyla escrow</span>
      </header>

      <div className="pv-earn__row">
        <div className="pv-earn__cell">
          <span className="pv-earn__cell-label">Today</span>
          <span className="pv-earn__cell-value">{formatEtb(stats.earnedTodayEtb)}</span>
        </div>
        <div className="pv-earn__cell">
          <span className="pv-earn__cell-label">Held in escrow</span>
          <span className="pv-earn__cell-value">
            {formatEtb(stats.pendingEarningsEtb)}
          </span>
          <span className="pv-earn__cell-note">
            {stats.pendingEarningsEtb > 0
              ? "released when the customer confirms"
              : "nothing pending"}
          </span>
        </div>
        <div className="pv-earn__cell">
          <span className="pv-earn__cell-label">Rating</span>
          <span className="pv-earn__cell-value">
            {stats.avgRating === null ? "—" : `${stats.avgRating.toFixed(1)} ★`}
          </span>
          <span className="pv-earn__cell-note">
            {stats.reviewCount === 0
              ? "no reviews yet"
              : `${stats.reviewCount} ${stats.reviewCount === 1 ? "review" : "reviews"}`}
          </span>
        </div>
      </div>
    </section>
  );
}
