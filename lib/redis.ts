import { Redis } from "@upstash/redis";

/**
 * Upstash Redis cache. Env yoksa (yerel geliştirme) bellek-içi Map'e düşer,
 * böylece anahtar olmadan da çalışır. PnL çağrıları Zerion kotasını korumak ve
 * paylaşılan kartların hızlı yüklenmesi için cache'lenir.
 */

let redis: Redis | null = null;
if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
  redis = new Redis({
    url: process.env.REDIS_URL,
    token: process.env.REDIS_TOKEN,
  });
}

type MemEntry = { value: unknown; expiresAt: number };
const mem = new Map<string, MemEntry>();

export async function cacheGet<T>(key: string): Promise<T | null> {
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
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds });
    return;
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
