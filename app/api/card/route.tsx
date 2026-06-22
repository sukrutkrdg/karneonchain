import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getNormalizedPnL } from "@/lib/pnl/service";
import { getBadge, getReputationScore } from "@/lib/pnl/score";
import { formatUsd, formatPct, truncateAddress, integrityDisplay } from "@/lib/format";
import { APP_NAME, parseWindowDays } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Farcaster/Base Mini App embed görseli 3:2 oranında olmalı.
const WIDTH = 1200;
const HEIGHT = 800;

/**
 * GET /api/card?address=0x...&window=90
 * Cüzdanın PnL'ini paylaşılabilir bir PNG kart/rozet olarak üretir.
 * Adres yoksa veya hata olursa marka kartına düşer.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const windowDays = parseWindowDays(req.nextUrl.searchParams.get("window"));

  // Kart hesaplama da pahalı; kötüye kullanımı sınırla (marka kartına düşer).
  const rl = await rateLimit(`card:${clientKey(req)}`, 60, 60);
  if (!rl.ok) return brandingCard();

  try {
    if (!address) return brandingCard();
    const pnl = await getNormalizedPnL(address, { windowDays });
    return pnlCard(pnl);
  } catch {
    return brandingCard();
  }
}

function pnlCard(pnl: Awaited<ReturnType<typeof getNormalizedPnL>>) {
  const badge = getBadge(pnl);
  const score = getReputationScore(pnl);
  const positive = pnl.roiPct >= 0;
  const integ = integrityDisplay(pnl.integrity);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${badge.colors[0]}22, #0b0e14 55%)`,
          color: "#e8edf6",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* Üst bar: marka + rozet */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 32, fontWeight: 700 }}>
            🛡️ {APP_NAME}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 24px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${badge.colors[0]}, ${badge.colors[1]})`,
              color: "#0b0e14",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {badge.emoji} {badge.label}
          </div>
        </div>

        {/* Orta: dev ROI */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 34, color: "#8b97ad", display: "flex" }}>
              Kanıtlanmış ROI • son {pnl.windowDays} gün
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                color: integ.color,
                border: `2px solid ${integ.color}`,
                borderRadius: 999,
                padding: "4px 18px",
              }}
            >
              {integ.text}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 168,
              fontWeight: 800,
              lineHeight: 1,
              color: positive ? "#22c55e" : "#ef4444",
            }}
          >
            {formatPct(pnl.roiPct)}
          </div>
          <div style={{ display: "flex", fontSize: 44, marginTop: 8, color: "#e8edf6" }}>
            Gerçekleşmiş PnL: {formatUsd(pnl.realizedPnlUsd)}
          </div>
        </div>

        {/* Alt: metrik şeridi */}
        <div style={{ display: "flex", marginTop: "auto", gap: 24 }}>
          <Stat label="İtibar Skoru" value={`${score}/100`} />
          <Stat label="Gerçek İşlem" value={`${pnl.tradeCount}`} />
          <Stat label="Net Yatırım" value={formatUsd(pnl.netInvestedUsd)} />
        </div>

        {/* Footer: adres + proof */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 32,
            fontSize: 24,
            color: "#8b97ad",
          }}
        >
          <div style={{ display: "flex" }}>{truncateAddress(pnl.address)} • Base</div>
          <div style={{ display: "flex" }}>proof:{pnl.proofHash}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, emoji: "twemoji" }
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "20px 28px",
        borderRadius: 20,
        background: "#141925cc",
        border: "1px solid #232a3a",
      }}
    >
      <div style={{ display: "flex", fontSize: 24, color: "#8b97ad" }}>{label}</div>
      <div style={{ display: "flex", fontSize: 48, fontWeight: 700, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function brandingCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6 60%, #0b0e14)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800 }}>🛡️ {APP_NAME}</div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 16, opacity: 0.9 }}>
          Onchain PnL&apos;ini kanıtla. Kartını cast&apos;le.
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, emoji: "twemoji" }
  );
}
