"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  formatUsd,
  formatPct,
  truncateAddress,
  integrityDisplay,
} from "@/lib/format";
import type { NormalizedPnL } from "@/lib/data/types";
import type { Badge } from "@/lib/pnl/score";

// API'den dönen tek taraf tipi.
type Side = {
  pnl: NormalizedPnL;
  reputation: number;
  badge: Badge;
};

type CompareResult = {
  a: Side;
  b: Side;
  winner: "a" | "b" | "tie";
};

interface CompareViewProps {
  /** Sayfa URL'inden gelen başlangıç adresleri (opsiyonel prefill). */
  initialA?: string;
  initialB?: string;
}

export function CompareView({ initialA = "", initialB = "" }: CompareViewProps) {
  const { address: connectedAddress } = useAccount();

  const [addrA, setAddrA] = useState(initialA);
  const [addrB, setAddrB] = useState(initialB);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bağlı cüzdanı A tarafına tek tıkla doldur.
  function fillMeA() {
    if (connectedAddress) setAddrA(connectedAddress);
  }

  async function handleCompare() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/compare?a=${encodeURIComponent(addrA)}&b=${encodeURIComponent(addrB)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Karşılaştırma başarısız oldu.");
        return;
      }
      setResult(json as CompareResult);
    } catch {
      setError("Ağ hatası. Lütfen tekrar dene.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Adres giriş alanları */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {/* Taraf A */}
        <div>
          <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Trader A
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="0x..."
              value={addrA}
              onChange={(e) => setAddrA(e.target.value)}
              style={inputStyle}
            />
            {connectedAddress && (
              <button
                onClick={fillMeA}
                className="btn btn-secondary"
                style={{ width: "auto", padding: "10px 14px", fontSize: 13, flexShrink: 0 }}
                title="Bağlı cüzdanımı kullan"
              >
                Ben
              </button>
            )}
          </div>
        </div>

        {/* Taraf B */}
        <div>
          <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Trader B
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={addrB}
            onChange={(e) => setAddrB(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Kapıştır butonu */}
      <button
        className="btn"
        onClick={handleCompare}
        disabled={loading || !addrA || !addrB}
      >
        {loading ? "Hesaplanıyor…" : "⚔️ Kapıştır"}
      </button>

      {/* Hata durumu */}
      {error && (
        <div
          className="card-surface"
          style={{ marginTop: 20, borderColor: "var(--red)", color: "var(--red)" }}
        >
          {error}
        </div>
      )}

      {/* Sonuçlar */}
      {result && (
        <div style={{ marginTop: 24 }}>
          {/* Kazanan başlığı */}
          <WinnerBanner winner={result.winner} sideA={result.a} sideB={result.b} />

          {/* Yan yana trader kartları */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <TraderCard side={result.a} label="A" isWinner={result.winner === "a"} />
            <TraderCard side={result.b} label="B" isWinner={result.winner === "b"} />
          </div>

          {/* İtibar skoru çubuğu karşılaştırması */}
          <ReputationBar repA={result.a.reputation} repB={result.b.reputation} winner={result.winner} />
        </div>
      )}
    </div>
  );
}

// ─── Alt bileşenler ───────────────────────────────────────────────────────────

function WinnerBanner({
  winner,
  sideA,
  sideB,
}: {
  winner: "a" | "b" | "tie";
  sideA: Side;
  sideB: Side;
}) {
  if (winner === "tie") {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "12px 16px",
          borderRadius: 14,
          background: "rgba(139,92,246,0.12)",
          border: "1px solid var(--accent-2)",
          fontWeight: 700,
        }}
      >
        🤝 Berabere — iki trader da eşit güçte!
      </div>
    );
  }

  const winner_side = winner === "a" ? sideA : sideB;
  return (
    <div
      style={{
        textAlign: "center",
        padding: "12px 16px",
        borderRadius: 14,
        background: `linear-gradient(135deg, ${winner_side.badge.colors[0]}22, ${winner_side.badge.colors[1]}22)`,
        border: `1px solid ${winner_side.badge.colors[0]}`,
        fontWeight: 700,
      }}
    >
      👑 Kazanan: Trader {winner.toUpperCase()} —{" "}
      {truncateAddress(winner_side.pnl.address)}
    </div>
  );
}

function TraderCard({
  side,
  label,
  isWinner,
}: {
  side: Side;
  label: string;
  isWinner: boolean;
}) {
  const positive = side.pnl.roiPct >= 0;
  const integ = integrityDisplay(side.pnl.integrity);

  return (
    <div
      className="card-surface"
      style={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        // Kazanan parlayan border efekti.
        boxShadow: isWinner
          ? `0 0 0 2px ${side.badge.colors[0]}, 0 0 20px ${side.badge.colors[0]}55`
          : undefined,
        borderColor: isWinner ? side.badge.colors[0] : undefined,
        background: `linear-gradient(160deg, ${side.badge.colors[0]}18, var(--bg-elev) 60%)`,
      }}
    >
      {/* Kazanan tacı */}
      {isWinner && (
        <div
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 22,
          }}
        >
          👑
        </div>
      )}

      {/* Taraf etiketi + rozet */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: "var(--muted)",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Trader {label}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 12,
            color: "#0b0e14",
            background: `linear-gradient(135deg, ${side.badge.colors[0]}, ${side.badge.colors[1]})`,
          }}
        >
          {side.badge.emoji} {side.badge.label}
        </span>
      </div>

      {/* Kısa adres */}
      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {truncateAddress(side.pnl.address)}
      </div>

      {/* ROI büyük yazı */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: 10,
          color: positive ? "var(--green)" : "var(--red)",
        }}
      >
        {formatPct(side.pnl.roiPct)}
      </div>

      {/* Gerçekleşmiş PnL */}
      <div style={{ fontSize: 13, marginTop: 4 }}>
        {formatUsd(side.pnl.realizedPnlUsd)}
      </div>

      {/* Küçük istatistikler */}
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <MiniStat label="İtibar" value={`${side.reputation}/100`} />
        <MiniStat label="İşlem" value={`${side.pnl.tradeCount}`} />
      </div>

      {/* Integrity chip */}
      <div style={{ marginTop: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: integ.color,
            border: `1px solid ${integ.color}`,
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {integ.text}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="muted" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 1 }}>{value}</div>
    </div>
  );
}

/**
 * Yatay inline-SVG çubuğu: iki traderin itibar skorunu görselleştirir.
 * Harici grafik kütüphanesi kullanılmaz.
 */
function ReputationBar({
  repA,
  repB,
  winner,
}: {
  repA: number;
  repB: number;
  winner: "a" | "b" | "tie";
}) {
  const total = repA + repB || 1; // Sıfıra bölme koruması.
  const pctA = Math.round((repA / total) * 100);
  const pctB = 100 - pctA;

  // Renk: kazanan tarafa accent, diğerine muted.
  const colorA =
    winner === "a" ? "var(--accent)" : winner === "tie" ? "var(--accent-2)" : "var(--border)";
  const colorB =
    winner === "b" ? "var(--accent-2)" : winner === "tie" ? "var(--accent)" : "var(--border)";

  return (
    <div className="card-surface" style={{ marginTop: 16 }}>
      <div
        className="muted"
        style={{ fontSize: 12, marginBottom: 10, textAlign: "center" }}
      >
        İtibar skoru karşılaştırması
      </div>

      {/* SVG çubuğu */}
      <svg
        width="100%"
        height="36"
        viewBox="0 0 300 36"
        preserveAspectRatio="none"
        aria-label={`Trader A: ${repA}, Trader B: ${repB}`}
      >
        {/* A tarafı — sol */}
        <rect x="0" y="8" width={pctA * 3} height="20" rx="6" fill={colorA} />
        {/* B tarafı — sağ (sağdan sola uzar) */}
        <rect
          x={300 - pctB * 3}
          y="8"
          width={pctB * 3}
          height="20"
          rx="6"
          fill={colorB}
        />
      </svg>

      {/* Skor etiketleri */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colorA }}>
          A · {repA}/100
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: colorB }}>
          {repB}/100 · B
        </span>
      </div>
    </div>
  );
}

// ─── Stil sabitleri ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg-elev)",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};
