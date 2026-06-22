import type { NormalizedPnL } from "@/lib/data/types";

export type Tier = "diamond" | "gold" | "silver" | "bronze" | "rekt";

export type Badge = {
  tier: Tier;
  label: string;
  emoji: string;
  /** Kart gradyanı için iki renk. */
  colors: [string, string];
};

const BADGES: Record<Tier, Badge> = {
  diamond: { tier: "diamond", label: "Elmas Trader", emoji: "💎", colors: ["#7dd3fc", "#a78bfa"] },
  gold: { tier: "gold", label: "Altın Trader", emoji: "🏆", colors: ["#fbbf24", "#f59e0b"] },
  silver: { tier: "silver", label: "Gümüş Trader", emoji: "🥈", colors: ["#cbd5e1", "#94a3b8"] },
  bronze: { tier: "bronze", label: "Bronz Trader", emoji: "🥉", colors: ["#d97706", "#b45309"] },
  rekt: { tier: "rekt", label: "Rekt", emoji: "💀", colors: ["#ef4444", "#7f1d1d"] },
};

/**
 * ROI + gerçekleşmiş PnL'e göre rozet seviyesi. Eşikler hem yüzdeyi hem mutlak
 * kârı gözetir ki "küçük anaparayla %1000" ile "büyük kâr" ayrı ödüllensin.
 */
export function getBadge(pnl: NormalizedPnL): Badge {
  const { roiPct, realizedPnlUsd } = pnl;
  if (roiPct <= 0 || realizedPnlUsd <= 0) return BADGES.rekt;
  if (roiPct >= 300 && realizedPnlUsd >= 10_000) return BADGES.diamond;
  if (roiPct >= 100 || realizedPnlUsd >= 25_000) return BADGES.gold;
  if (roiPct >= 25 || realizedPnlUsd >= 2_500) return BADGES.silver;
  return BADGES.bronze;
}

/**
 * 0–100 itibar skoru. Sadece ROI değil; "skin in the game" (net yatırılan),
 * aktivite (işlem sayısı) ve gürültü oranı da hesaba katılır. Çok az işlemli
 * veya çok küçük anaparalı şişirilmiş ROI'ler cezalandırılır → manipülasyona
 * daha dirençli bir tek-sayı itibar.
 */
export function getReputationScore(pnl: NormalizedPnL): number {
  const { roiPct, netInvestedUsd, tradeCount, noiseFilteredCount, integrity } = pnl;

  // ROI bileşeni (0–55): logaritmik, +%200'de doyuma yaklaşır.
  const roiComponent =
    roiPct <= 0 ? 0 : Math.min(55, (Math.log10(1 + roiPct) / Math.log10(201)) * 55);

  // Skin-in-the-game (0–25): $10k net yatırımda doyum.
  const capitalComponent = Math.min(25, (Math.min(netInvestedUsd, 10_000) / 10_000) * 25);

  // Aktivite (0–20): 30 işlemde doyum; tek-atış pump'ları engeller.
  const activityComponent = Math.min(20, (Math.min(tradeCount, 30) / 30) * 20);

  // Gürültü cezası: spam oranı yüksekse güven düşer.
  const totalSeen = tradeCount + noiseFilteredCount;
  const noiseRatio = totalSeen > 0 ? noiseFilteredCount / totalSeen : 0;
  const noisePenalty = noiseRatio * 15;

  // Manipülasyon cezası (0–30): churn ve tek-pair yoğunlaşması itibarı düşürür;
  // "flagged" durum ROI'den kazanılanı büyük oranda geri alır.
  const churnPenalty = (integrity.churnRatioPct / 100) * 20;
  const flagPenalty = integrity.label === "flagged" ? 10 : 0;
  const manipulationPenalty = Math.min(30, churnPenalty + flagPenalty);

  const score =
    roiComponent +
    capitalComponent +
    activityComponent -
    noisePenalty -
    manipulationPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}
