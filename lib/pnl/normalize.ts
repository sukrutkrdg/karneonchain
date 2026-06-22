import { createHash } from "node:crypto";
import type { NormalizedPnL, RawPnL, RawTrade } from "@/lib/data/types";

/**
 * Ham sağlayıcı çıktısını uygulamanın kullandığı normalize PnL'e çevirir.
 *
 * Gürültü temizleme (MVP heuristikleri — moat'ın çekirdeği, Faz 4'te derinleşir):
 *  - `is_trash` işaretli (spam/airdrop token) swap'ları ele.
 *  - Başarısız (failed) işlemleri ele.
 * Geriye kalan "gerçek" swap'lar sayılır; elenenler şeffaflık için raporlanır.
 * Realized PnL/ROI değerleri Zerion'un FIFO hesabından gelir (sağlayıcı zaten
 * çoğu gürültüyü dışlar); buradaki sayım kart üstündeki iddiayı destekler.
 */
export function normalizePnL(
  raw: RawPnL,
  windowDays: number
): NormalizedPnL {
  const genuine: RawTrade[] = [];
  let noiseFiltered = 0;

  for (const t of raw.trades) {
    if (t.isTrash || t.status === "failed") {
      noiseFiltered++;
      continue;
    }
    genuine.push(t);
  }

  return {
    address: raw.address,
    chain: "base",
    provider: raw.source,
    windowDays,

    realizedPnlUsd: round2(raw.realizedPnlUsd),
    unrealizedPnlUsd: round2(raw.unrealizedPnlUsd),
    totalPnlUsd: round2(raw.totalPnlUsd),
    netInvestedUsd: round2(raw.netInvestedUsd),
    totalFeesUsd: round2(raw.totalFeesUsd),

    roiPct: round2(raw.realizedRoiPct),

    tradeCount: genuine.length,
    tradeCountInWindow: genuine.length,
    noiseFilteredCount: noiseFiltered,

    computedAt: Date.now(),
    proofHash: proofHashOf(raw.address, genuine),
  };
}

/**
 * Hesaplama girdilerinin deterministik parmak izi: adres + sıralı tx hash kümesi.
 * Aynı girdi → aynı hash. Kartta "doğrulanabilir" rozetini destekler (Faz 4).
 */
function proofHashOf(address: string, trades: RawTrade[]): string {
  const hashes = trades
    .map((t) => t.hash.toLowerCase())
    .sort()
    .join(",");
  return createHash("sha256")
    .update(`${address.toLowerCase()}|${hashes}`)
    .digest("hex")
    .slice(0, 16);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
