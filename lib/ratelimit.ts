import { getRedis } from "./redis";

/**
 * Basit sabit-pencere (fixed-window) rate limit. Redis varsa INCR+EXPIRE;
 * yoksa bellek-içi (serverless'te süreç-başına — zayıf ama yoktan iyi). Auth
 * (SIWE/Farcaster Quick-Auth) eklenene dek kimliksiz pahalı uç noktaları ve
 * yazma uçlarını kötüye kullanıma karşı korur.
 *
 * NOT (Faz 2): kimlik doğrulaması gelince yazma uçları (follow/leaderboard)
 * imzalı kimliğe bağlanmalı; rate-limit ek katman olarak kalmalı.
 */
type Result = { ok: boolean; remaining: number };

const mem = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<Result> {
  const redis = getRedis();
  if (redis) {
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSec);
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  }
  const now = Date.now();
  const hit = mem.get(key);
  if (!hit || now > hit.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1 };
  }
  hit.count++;
  return { ok: hit.count <= limit, remaining: Math.max(0, limit - hit.count) };
}

/** İstekten kaba bir istemci anahtarı (IP) çıkarır. */
export function clientKey(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || "anon";
}

/** 429 yanıtı (ortak). */
export function tooMany(): Response {
  return Response.json(
    { error: "Çok fazla istek — lütfen biraz bekleyin." },
    { status: 429 }
  );
}
