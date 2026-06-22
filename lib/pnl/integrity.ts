import type { IntegritySignal, RawTrade } from "@/lib/data/types";

/** Round-trip penceresi: bir varlık alınıp bu süre içinde satılırsa "churn" sayılır. */
const ROUND_TRIP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Sinyalin anlamlı olması için gereken minimum işlem sayısı. */
const MIN_TRADES_TO_JUDGE = 4;

/**
 * Manipülasyon/şişirme sinyali üretir. Karşı-taraf verisi olmadığı için kesin
 * wash-trading iddiası yapmaz; wash/airdrop-farming şişirmesine eşlik eden iki
 * gözlemlenebilir örüntüyü ölçer:
 *
 *  1. Round-trip churn: aynı varlığı kısa sürede al-sat döngüsü (hacmi yapay
 *     büyütür, gerçek yönlü pozisyon almaz).
 *  2. Tek-pair yoğunlaşması: işlemlerin büyük kısmının tek bir token-çiftinde
 *     toplanması (bot/farm davranışının izi).
 *
 * Çıktı hem kartta "doğrulanabilirlik" etiketi olarak gösterilir hem de itibar
 * skorunu (lib/pnl/score.ts) cezalandırır.
 */
export function computeIntegrity(trades: RawTrade[]): IntegritySignal {
  const n = trades.length;
  if (n === 0) {
    return { churnRatioPct: 0, topPairConcentrationPct: 0, suspicious: false, label: "clean" };
  }

  const sorted = [...trades].sort((a, b) => a.minedAt - b.minedAt);

  // 1) Round-trip churn: bir varlık alındıktan sonra pencere içinde satılması.
  const acquiredAt = new Map<string, number>();
  let roundTrips = 0;
  for (const t of sorted) {
    const bought = norm(t.boughtSymbol);
    const sold = norm(t.soldSymbol);

    if (sold) {
      const since = acquiredAt.get(sold);
      if (since !== undefined && t.minedAt - since <= ROUND_TRIP_WINDOW_MS) {
        roundTrips++;
        acquiredAt.delete(sold); // pozisyon kapandı
      }
    }
    if (bought) {
      acquiredAt.set(bought, t.minedAt);
    }
  }
  const churnRatioPct = round1((roundTrips / n) * 100);

  // 2) Tek-pair yoğunlaşması.
  const pairCounts = new Map<string, number>();
  for (const t of sorted) {
    const key = `${norm(t.soldSymbol)}>${norm(t.boughtSymbol)}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const maxPair = Math.max(...pairCounts.values());
  const topPairConcentrationPct = round1((maxPair / n) * 100);

  // 3) Etiketleme — az işlemde yargıda bulunma.
  let label: IntegritySignal["label"] = "clean";
  if (n >= MIN_TRADES_TO_JUDGE) {
    if (churnRatioPct >= 60 || topPairConcentrationPct >= 85) {
      label = "flagged";
    } else if (churnRatioPct >= 35 || topPairConcentrationPct >= 65) {
      label = "watch";
    }
  }

  return {
    churnRatioPct,
    topPairConcentrationPct,
    suspicious: label !== "clean",
    label,
  };
}

function norm(sym: string): string {
  return (sym || "").trim().toUpperCase();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
