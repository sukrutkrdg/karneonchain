import type { NormalizedPnL } from "@/lib/data/types";
import { getBadge, getReputationScore } from "@/lib/pnl/score";
import { formatUsd, formatPct, truncateAddress } from "@/lib/format";
import { BadgeTier } from "./BadgeTier";

/** Uygulama içi PnL kartı önizlemesi — OG kartıyla aynı tasarım dili. */
export function PnlCard({ pnl }: { pnl: NormalizedPnL }) {
  const badge = getBadge(pnl);
  const score = getReputationScore(pnl);
  const positive = pnl.roiPct >= 0;

  return (
    <div
      className="card-surface"
      style={{
        background: `linear-gradient(135deg, ${badge.colors[0]}1a, var(--bg-elev) 55%)`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>🛡️ Pasaport</span>
        <BadgeTier badge={badge} />
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="muted" style={{ fontSize: 14 }}>
          Kanıtlanmış ROI • son {pnl.windowDays} gün
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            color: positive ? "var(--green)" : "var(--red)",
          }}
        >
          {formatPct(pnl.roiPct)}
        </div>
        <div style={{ fontSize: 20, marginTop: 4 }}>
          Gerçekleşmiş PnL: {formatUsd(pnl.realizedPnlUsd)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <Stat label="İtibar" value={`${score}/100`} />
        <Stat label="İşlem" value={`${pnl.tradeCount}`} />
        <Stat label="Net Yatırım" value={formatUsd(pnl.netInvestedUsd)} />
      </div>

      <div
        className="muted"
        style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 12 }}
      >
        <span>{truncateAddress(pnl.address)} • Base</span>
        <span>
          proof:{pnl.proofHash}
          {pnl.noiseFilteredCount > 0 && ` • ${pnl.noiseFilteredCount} spam elendi`}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
