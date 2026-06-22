/**
 * Base spot-DEX indexer için sabitler ve ABI parçaları.
 * Üçüncü taraf API yok; her şey zincirden (RPC log/decode) okunur.
 */

import { parseAbiItem } from "viem";

/** ERC-20 Transfer olayı — indexed from/to ile cüzdanı topic üzerinden filtreleriz. */
export const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

/** symbol()/decimals() okumak için minimal ERC-20 ABI (multicall için). */
export const ERC20_META_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

/**
 * USD numeraire kabul edilen quote varlıkları (Base mainnet).
 * USDC ve köprülenmiş USDbC; her ikisi de 6 ondalık.
 * Adresler lowercase tutulur (log topic karşılaştırması için).
 */
export const USDC_ADDRESS =
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const; // Native USDC
export const USDBC_ADDRESS =
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca" as const; // Bridged USDbC

/** Quote varlık -> ondalık. USD değeri = miktar (1 USDC ~= 1 USD varsayımı). */
export const QUOTE_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [USDC_ADDRESS]: { symbol: "USDC", decimals: 6 },
  [USDBC_ADDRESS]: { symbol: "USDbC", decimals: 6 },
};

/** Bir adres USD numeraire (quote) varlığı mı? */
export function isQuoteToken(address: string): boolean {
  return address.toLowerCase() in QUOTE_TOKENS;
}

// ---- RPC tarama parametreleri ----

/** Base ~2sn/blok → günde ~43200 blok. */
export const BLOCKS_PER_DAY = 43200;

/** getLogs başına blok sayısı (RPC limitlerine takılmamak için). */
export const CHUNK_BLOCKS = 8000n;

/**
 * Toplam taranacak blok aralığı üst sınırı (DoS/maliyet koruması).
 * ~120 günlük pencereye karşılık gelir; daha büyük windowDays bu değere kırpılır.
 */
export const MAX_SCAN_BLOCKS = BigInt(BLOCKS_PER_DAY * 120);
