/**
 * Sosyal grafik + "Kirala beni" ücretli alpha veri modeli.
 * Upstash Redis kullanır; env yoksa bellek-içi Map'e düşer (yerel geliştirme).
 *
 * Takip (follow) modeli:
 *   Set  `followers:{trader}`   → üyeler: takipçi adresleri
 *   Set  `following:{user}`     → üyeler: takip edilen trader adresleri
 *
 * Kirala beni (ücretli alpha) modeli:
 *   Hash `trader:meta:{trader}` → { rentPriceUsd?, bio? }
 *   Set  `subscribers:{trader}` → üyeler: abone adresleri
 *
 * NOT: Gerçek ödeme entegrasyonu yoktur — bu yalnızca veri modeli + UI stubdur.
 * Faz 2'de Base Pay / USDC akış ödemesi eklenecek.
 */

import { getRedis } from "@/lib/redis";

// Merkezi Redis istemcisi (set/hash komutları için ham client).
const redis = getRedis();

// Bellek-içi yedek (yerel geliştirme için)
const memSets = new Map<string, Set<string>>();
const memHashes = new Map<string, Record<string, string>>();

// ---------------------------------------------------------------------------
// Yardımcı — bellek-içi set işlemleri
// ---------------------------------------------------------------------------

function memSetAdd(key: string, member: string): void {
  if (!memSets.has(key)) memSets.set(key, new Set());
  memSets.get(key)!.add(member);
}

function memSetRemove(key: string, member: string): void {
  memSets.get(key)?.delete(member);
}

function memSetIsMember(key: string, member: string): boolean {
  return memSets.get(key)?.has(member) ?? false;
}

function memSetCard(key: string): number {
  return memSets.get(key)?.size ?? 0;
}

// ---------------------------------------------------------------------------
// Tip tanımları
// ---------------------------------------------------------------------------

/** Trader'a ait "Kirala beni" meta verisi. */
export type TraderMeta = {
  /** Aylık ücretli alpha fiyatı (USD). Yoksa fiyat belirlenmemiş sayılır. */
  rentPriceUsd?: number;
  /** Trader bio/tanıtım metni. */
  bio?: string;
};

// ---------------------------------------------------------------------------
// Adres normalleştirme
// ---------------------------------------------------------------------------

/** Tüm adresleri küçük harfe indirger — Redis anahtarlarını tutarlı kılar. */
function norm(address: string): string {
  return address.toLowerCase();
}

// ---------------------------------------------------------------------------
// Takip (follow/unfollow) işlemleri
// ---------------------------------------------------------------------------

/**
 * `user`, `trader`'ı takip eder.
 * İlişki çift yönlü: `followers:{trader}` + `following:{user}` güncellenir.
 */
export async function follow(user: string, trader: string): Promise<void> {
  const u = norm(user);
  const t = norm(trader);

  if (redis) {
    // sadd çoklu üye ekleyebilir; 1 döndürürse yeni ekleme, 0 zaten vardı
    await Promise.all([
      redis.sadd(`followers:${t}`, u),
      redis.sadd(`following:${u}`, t),
    ]);
  } else {
    memSetAdd(`followers:${t}`, u);
    memSetAdd(`following:${u}`, t);
  }
}

/**
 * `user`, `trader`'ı takipten çıkar.
 */
export async function unfollow(user: string, trader: string): Promise<void> {
  const u = norm(user);
  const t = norm(trader);

  if (redis) {
    await Promise.all([
      redis.srem(`followers:${t}`, u),
      redis.srem(`following:${u}`, t),
    ]);
  } else {
    memSetRemove(`followers:${t}`, u);
    memSetRemove(`following:${u}`, t);
  }
}

/**
 * `user`'ın `trader`'ı takip edip etmediğini döndürür.
 */
export async function isFollowing(
  user: string,
  trader: string
): Promise<boolean> {
  const u = norm(user);
  const t = norm(trader);

  if (redis) {
    const result = await redis.sismember(`followers:${t}`, u);
    return result === 1;
  }
  return memSetIsMember(`followers:${t}`, u);
}

/**
 * `trader`'ın kaç takipçisi olduğunu döndürür.
 */
export async function followerCount(trader: string): Promise<number> {
  const t = norm(trader);

  if (redis) {
    return (await redis.scard(`followers:${t}`)) ?? 0;
  }
  return memSetCard(`followers:${t}`);
}

/**
 * `user`'ın kaç kişiyi takip ettiğini döndürür.
 */
export async function followingCount(user: string): Promise<number> {
  const u = norm(user);

  if (redis) {
    return (await redis.scard(`following:${u}`)) ?? 0;
  }
  return memSetCard(`following:${u}`);
}

// ---------------------------------------------------------------------------
// Kirala beni — ücretli alpha (STUB — gerçek ödeme yok)
// ---------------------------------------------------------------------------

/**
 * Trader'ın "Kirala beni" meta verisini getirir.
 * Yoksa boş obje döner (fiyat belirlenmemiş).
 *
 * NOT: Gerçek abone akışı/ödeme Faz 2'de Base Pay ile eklenecek.
 */
export async function getTraderMeta(trader: string): Promise<TraderMeta> {
  const t = norm(trader);
  const key = `trader:meta:${t}`;

  if (redis) {
    const raw = await redis.hgetall<Record<string, string>>(key);
    if (!raw) return {};
    return {
      rentPriceUsd: raw.rentPriceUsd ? Number(raw.rentPriceUsd) : undefined,
      bio: raw.bio || undefined,
    };
  }

  const raw = memHashes.get(key);
  if (!raw) return {};
  return {
    rentPriceUsd: raw.rentPriceUsd ? Number(raw.rentPriceUsd) : undefined,
    bio: raw.bio || undefined,
  };
}

/**
 * Trader'ın "Kirala beni" meta verisini kaydeder.
 *
 * NOT: Gerçek abone akışı/ödeme Faz 2'de Base Pay ile eklenecek.
 */
export async function setTraderMeta(
  trader: string,
  meta: TraderMeta
): Promise<void> {
  const t = norm(trader);
  const key = `trader:meta:${t}`;

  // Yalnızca tanımlı alanları kaydet
  const fields: Record<string, string> = {};
  if (meta.rentPriceUsd !== undefined)
    fields.rentPriceUsd = String(meta.rentPriceUsd);
  if (meta.bio !== undefined) fields.bio = meta.bio;

  if (Object.keys(fields).length === 0) return;

  if (redis) {
    await redis.hset(key, fields);
  } else {
    const existing = memHashes.get(key) ?? {};
    memHashes.set(key, { ...existing, ...fields });
  }
}

/**
 * Trader'ın kaç abonesi olduğunu döndürür.
 * (STUB — abone ekleme Faz 2'de gerçek ödeme akışıyla yapılacak.)
 */
export async function subscriberCount(trader: string): Promise<number> {
  const t = norm(trader);
  const key = `subscribers:${t}`;

  if (redis) {
    return (await redis.scard(key)) ?? 0;
  }
  return memSetCard(key);
}
