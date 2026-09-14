// Color-coded 1-5 lift/effort badge: green (easy) -> red (hard), per spec.
//
// This is an ordinal severity scale shown one value at a time per row, not a
// simultaneous-series chart palette — so rather than force 5 steps through
// the categorical CVD-separation gate (verified two adjacent greens can't
// both read as "green" AND clear it — see conversation), color is never the
// only signal: every badge always shows the number and label as text, which
// is the documented exception for this case. Fill shades are chosen dark
// enough for white text to clear WCAG AA (4.5:1) at every step, in both themes.
export const LIFT_COLORS: Record<number, string> = {
  1: "#15803d", // green
  2: "#4d7c0f", // olive/lime
  3: "#a16207", // amber
  4: "#c2410c", // orange
  5: "#b91c1c", // red
};

interface LiftBadgeProps {
  score: number;
  label: string;
}

export function LiftBadge({ score, label }: LiftBadgeProps) {
  const color = LIFT_COLORS[score] ?? "#52514e";
  return (
    <span className="lift-badge" style={{ backgroundColor: color }}>
      {score}/5 {label}
    </span>
  );
}

/** Compact per-lift-level count chips for the Past Audits list. */
export function LiftCountsSummary({ counts }: { counts: Record<1 | 2 | 3 | 4 | 5, number> }) {
  const levels = ([1, 2, 3, 4, 5] as const).filter((n) => counts[n] > 0);
  if (levels.length === 0) {
    return <span className="app__saved-meta">No findings yet</span>;
  }
  return (
    <span className="lift-counts">
      {levels.map((n) => (
        <span
          key={n}
          className="lift-counts__chip"
          style={{ backgroundColor: LIFT_COLORS[n] }}
          title={`Lift ${n}: ${counts[n]} item${counts[n] === 1 ? "" : "s"}`}
        >
          {counts[n]}
        </span>
      ))}
    </span>
  );
}
