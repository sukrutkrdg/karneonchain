import type { Badge } from "@/lib/pnl/score";

/** Rozet seviyesini gradyanlı bir pill olarak gösterir (kartla aynı renkler). */
export function BadgeTier({ badge }: { badge: Badge }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        fontWeight: 700,
        color: "#0b0e14",
        background: `linear-gradient(135deg, ${badge.colors[0]}, ${badge.colors[1]})`,
      }}
    >
      <span>{badge.emoji}</span>
      <span>{badge.label}</span>
    </span>
  );
}
