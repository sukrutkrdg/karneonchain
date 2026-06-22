import { isAddress } from "viem";
import { getProvider } from "@/lib/data/provider";
import { normalizePnL } from "./normalize";
import { cacheGet, cacheSet } from "@/lib/redis";
import { PNL_WINDOW_DAYS } from "@/lib/config";
import type { NormalizedPnL } from "@/lib/data/types";

const CACHE_TTL_SECONDS = 5 * 60; // 5 dk — PnL yavaş değişir, kart yüklemesi hızlı olsun.

export class InvalidAddressError extends Error {}

/**
 * Bir cüzdan için normalize PnL'i döndürür. Sağlayıcı → gürültü temizleme →
 * cache zincirini tek yerde toplar; hem /api/pnl hem kart (/api/card) bunu kullanır.
 */
export async function getNormalizedPnL(
  address: string,
  opts: { windowDays?: number; force?: boolean } = {}
): Promise<NormalizedPnL> {
  if (!isAddress(address)) {
    throw new InvalidAddressError(`Geçersiz adres: ${address}`);
  }
  const windowDays = opts.windowDays ?? PNL_WINDOW_DAYS;
  const addr = address.toLowerCase();
  const key = `pnl:${addr}:${windowDays}`;

  if (!opts.force) {
    const cached = await cacheGet<NormalizedPnL>(key);
    if (cached) return cached;
  }

  const provider = getProvider();
  const raw = await provider.getWalletPnL(addr, { windowDays });
  const normalized = normalizePnL(raw, windowDays);

  await cacheSet(key, normalized, CACHE_TTL_SECONDS);
  return normalized;
}
