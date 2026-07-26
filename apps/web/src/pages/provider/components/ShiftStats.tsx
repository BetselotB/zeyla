import type { ProviderShiftStats } from "@zeyla/shared";
import { formatEtb } from "../lib/format";

/**
 * Today's shift. Money first, because that is the question the provider opened
 * the app to answer. Time online is deliberately absent — it ticks live on the
 * availability card just above, and printing it twice makes both copies look
 * like they might disagree.
 */
export function ShiftStats({ stats }: { stats: ProviderShiftStats }) {
  const cells: { label: string; value: string; note?: string }[] = [
    {
      label: "Earned today",
      value: formatEtb(stats.earnedTodayEtb),
      note:
        stats.pendingEarningsEtb > 0
          ? `${formatEtb(stats.pendingEarningsEtb)} held in escrow`
          : undefined,
    },
    {
      label: "Jobs completed",
      value: String(stats.completedToday),
      note: `${stats.acceptedToday} accepted today`,
    },
    {
      label: "Requests received",
      value: String(stats.pingsReceivedToday),
      note:
        stats.pendingPings > 0
          ? `${stats.pendingPings} waiting on you`
          : "none waiting",
    },
    {
      label: "Acceptance rate",
      value: stats.acceptanceRate === null ? "—" : `${stats.acceptanceRate}%`,
      note: stats.acceptanceRate === null ? "no answers yet" : "last 30 days",
    },
  ];

  return (
    <section className="pv-stats" aria-label="Today's shift">
      {cells.map((cell) => (
        <div key={cell.label} className="pv-stat">
          <span className="pv-stat__label">{cell.label}</span>
          <span className="pv-stat__value">{cell.value}</span>
          {cell.note && <span className="pv-stat__note">{cell.note}</span>}
        </div>
      ))}
    </section>
  );
}
