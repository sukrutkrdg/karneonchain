/**
 * Liderboard veri katmanı. Upstash Redis sorted-set'leri kullanır:
 *   lb:roi   → member=adres, score=roiPct
 *   lb:score → member=adres, score=itibar puanı (0-100)
 *   lb:data  → hash: adres → JSON snapshot
 *
 * REDIS_URL/REDIS_TOKEN yoksa bellek-içi Map/dizi fallback'ine düşer;
 * yerel geliştirmede deployment'sız çalışır.
 */

import { getRedis } from "@/lib/redis";
import { getBadge, getReputationScore } from "@/lib/pnl/score";
import type { NormalizedPnL } from "@/lib/data/types";

// Merkezi Redis istemcisi (sorted-set/hash komutları için ham client).
const redis = getRedis();

// ---------------------------------------------------------------------------
// Snapshot tipi — liderboard satırında gösterilen tüm alanlar
// ---------------------------------------------------------------------------
export type Snapshot = {
  address: string;
  roiPct: number;
  realizedPnlUsd: number;
  reputation: number;
  tradeCount: number;
  badgeTier: string;
  badgeEmoji: string;
  integrityLabel: "clean" | "watch" | "flagged";
  updatedAt: number; // unix ms
};

// ---------------------------------------------------------------------------
// Bellek-içi fallback (Redis yokken)
// ---------------------------------------------------------------------------

// Tüm snapshot'ları tutan Map<adres, Snapshot>
const memData = new Map<string, Snapshot>();

// Sorted-set simülasyonu: { address, score } dizileri
const memRoi: { address: string; score: number }[] = [];
const memReputation: { address: string; score: number }[] = [];

/** Bellek içi sorted-set'e ekler/günceller (artan sıra tutulur). */
function memZadd(
  arr: { address: string; score: number }[],
  address: string,
  score: number
) {
  const idx = arr.findIndex((e) => e.address === address);
  if (idx !== -1) {
    arr[idx].score = score;
  } else {
    arr.push({ address, score });
  }
}

/** Bellek içi ZRANGE DESC (büyükten küçüğe) ile ilk `limit` kaydı döndürür. */
function memZrangeDesc(
  arr: { address: string; score: number }[],
  limit: number
): string[] {
  return [...arr]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.address);
}

/** Bellek içi rank (0-tabanlı, büyükten küçüğe). */
function memZrank(
  arr: { address: string; score: number }[],
  address: string
): number | null {
  const sorted = [...arr].sort((a, b) => b.score - a.score);
  const idx = sorted.findIndex((e) => e.address === address);
  return idx === -1 ? null : idx;
}

// ---------------------------------------------------------------------------
// Redis key sabitleri
// ---------------------------------------------------------------------------
const KEY_ROI = "lb:roi";
const KEY_SCORE = "lb:score";
const KEY_DATA = "lb:data";

/** Liderboard sorted-set'lerinde tutulacak maksimum kayıt (sınırsız büyüme koruması). */
const MAX_ENTRIES = 5000;

// ---------------------------------------------------------------------------
// Dışa açık fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Bir cüzdanın PnL verisini liderboard'a kaydeder.
 * Hem ROI hem itibar sorted-set'lerini günceller, snapshot'ı hash'e yazar.
 */
export async function recordWallet(pnl: NormalizedPnL): Promise<void> {
  const address = pnl.address.toLowerCase();
  const badge = getBadge(pnl);
  const reputation = getReputationScore(pnl);

  const snapshot: Snapshot = {
    address,
    roiPct: pnl.roiPct,
    realizedPnlUsd: pnl.realizedPnlUsd,
    reputation,
    tradeCount: pnl.tradeCount,
    badgeTier: badge.tier,
    badgeEmoji: badge.emoji,
    integrityLabel: pnl.integrity.label,
    updatedAt: Date.now(),
  };

  if (redis) {
    // Upstash Redis: pipeline ile atomik yazım
    const pipe = redis.pipeline();
    pipe.zadd(KEY_ROI, { score: pnl.roiPct, member: address });
    pipe.zadd(KEY_SCORE, { score: reputation, member: address });
    pipe.hset(KEY_DATA, { [address]: JSON.stringify(snapshot) });
    // Set boyutunu sınırla: yalnızca en yüksek puanlı ilk MAX_ENTRIES kalsın
    // (kimliksiz POST ile sınırsız büyümeye karşı). En düşük sıradakileri at.
    // NOT: lb:data hash'i orphan bırakabilir — Faz 2'de periyodik temizlik.
    pipe.zremrangebyrank(KEY_ROI, 0, -(MAX_ENTRIES + 1));
    pipe.zremrangebyrank(KEY_SCORE, 0, -(MAX_ENTRIES + 1));
    await pipe.exec();
  } else {
    // Bellek-içi fallback
    memZadd(memRoi, address, pnl.roiPct);
    memZadd(memReputation, address, reputation);
    memData.set(address, snapshot);
  }
}

/**
 * Seçilen metriğe göre ilk `limit` trader'ı büyükten küçüğe döndürür.
 * @param metric 'roi' | 'score'
 * @param limit  Kaç kayıt isteniyor (maks. 100 önerilir)
 */
export async function getTop(
  metric: "roi" | "score",
  limit: number
): Promise<Snapshot[]> {
  const key = metric === "roi" ? KEY_ROI : KEY_SCORE;
  const count = Math.max(1, Math.min(limit, 200));

  let addresses: string[];

  if (redis) {
    // ZRANGE ... REV — büyükten küçüğe
    const raw = await redis.zrange<string[]>(key, 0, count - 1, { rev: true });
    addresses = raw ?? [];
  } else {
    const arr = metric === "roi" ? memRoi : memReputation;
    addresses = memZrangeDesc(arr, count);
  }

  if (addresses.length === 0) return [];

  // Snapshot'ları çek
  let snapshots: Snapshot[] = [];

  if (redis) {
    const jsons = await redis.hmget<Record<string, string>>(KEY_DATA, ...addresses);
    if (jsons) {
      snapshots = addresses
        .map((addr) => {
          const raw = jsons[addr];
          if (!raw) return null;
          try {
            return JSON.parse(raw) as Snapshot;
          } catch {
            return null;
          }
        })
        .filter((s): s is Snapshot => s !== null);
    }
  } else {
    snapshots = addresses
      .map((addr) => memData.get(addr))
      .filter((s): s is Snapshot => s !== undefined);
  }

  return snapshots;
}

/**
 * Belirtilen metrikte cüzdanın sırasını döndürür (1-tabanlı).
 * Listede yoksa null döner.
 */
export async function getRank(
  address: string,
  metric: "roi" | "score"
): Promise<number | null> {
  const addr = address.toLowerCase();
  const key = metric === "roi" ? KEY_ROI : KEY_SCORE;

  if (redis) {
    // ZREVRANK: büyükten küçüğe 0-tabanlı sıra
    const rank = await redis.zrevrank(key, addr);
    if (rank === null || rank === undefined) return null;
    return (rank as number) + 1; // 1-tabanlıya çevir
  } else {
    const arr = metric === "roi" ? memRoi : memReputation;
    const rank = memZrank(arr, addr);
    return rank === null ? null : rank + 1;
  }
}
