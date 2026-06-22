import { Redis } from "@upstash/redis";

/**
 * Tek merkezi Upstash Redis istemcisi. leaderboard.ts ve follow.ts de bunu
 * import eder (üç ayrı `new Redis` → tek havuz; tek env, tek fallback noktası).
 * Env yoksa null döner → çağıranlar bellek-içi fallback'e düşer.
 *
 * UYARI: bellek-içi fallback serverless'te (Vercel) süreç-başına ve geçicidir —
 * leaderboard/follow verisi istekler arası kaybolur. Bu yüzden production'da
 * Redis env eksikse hata loglanır.
 */
let redis: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (initialized) return redis;
  initialized = true;
  if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
    redis = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
  } else if (process.env.NODE_ENV === "production") {
    console.error(
      "[redis] REDIS_URL/REDIS_TOKEN eksik — bellek-içi fallback kalıcı DEĞİL; " +
        "leaderboard/follow verisi serverless'te kaybolacak."
    );
  }
  return redis;
}

type MemEntry = { value: unknown; expiresAt: number };
const mem = new Map<string, MemEntry>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    return (await redis.get<T>(key)) ?? null;
  }
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    mem.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
