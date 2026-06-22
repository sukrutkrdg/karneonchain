/**
 * IndexerProvider — Base spot-DEX PnL'ini DOĞRUDAN zincir verisinden hesaplar.
 *
 * Üçüncü taraf API yok: viem public client ile ERC-20 Transfer loglarını
 * tarar, işlem (tx) bazında cüzdanın net token deltalarını çıkarır, bir bacağı
 * USDC/USDbC (USD numeraire) olan swap'ları FIFO maliyet-bazı ile eşleştirip
 * gerçekleşmiş PnL üretir.
 *
 * DÜRÜST KISITLAR (bilerek tasarım kararı):
 *  - PnL yalnızca USDC/USDbC bacağı olan trade'lerden hesaplanır. Token<->token
 *    (örn. WETH<->cbETH) swap'larında fiyat oracle'ı OLMADIĞINDAN USD değeri
 *    güvenilir biçimde bilinemez; bu trade'ler sayım/bütünlük için kaydedilir
 *    ama valueUsd=0 ile gelir ve PnL'e KATKI VERMEZ (uydurma yapılmaz).
 *  - 1 USDC ~= 1 USD varsayılır (stablecoin de-peg göz ardı edilir).
 *  - unrealizedPnlUsd = 0 (MVP). Açık lotların güncel piyasa değeri için fiyat
 *    kaynağı gerektiğinden hesaplanmaz.
 *  - totalFeesUsd = 0 (gas, ETH cinsinden olup USD'ye çevirmek oracle ister).
 *  - Sadece basit (tek-in / tek-out) swap topolojisi PnL'e alınır; çok bacaklı
 *    karmaşık tx'ler trade olarak işaretlenir ama miktar belirsizse atlanır.
 */

import {
  createPublicClient,
  http,
  getAddress,
  type Address,
  type Log,
} from "viem";
import { base } from "viem/chains";

/**
 * Base zincirinin özel formatlayıcıları (ör. "deposit" tx tipi) yüzünden
 * createPublicClient'ın döndürdüğü somut tip, çıplak `PublicClient` tipine
 * atanamaz. Tüm yardımcılarda bu türetilmiş tipi kullanarak tip uyumunu sağlıyoruz.
 */
const DEFAULT_BASE_RPC = "https://mainnet.base.org";

/** BASE_RPC_URL'i doğrula (https zorunlu); geçersizse public RPC'ye düş. */
function resolveRpcUrl(): string {
  const url = process.env.BASE_RPC_URL;
  if (!url) return DEFAULT_BASE_RPC;
  try {
    if (new URL(url).protocol !== "https:") throw new Error("https gerekli");
    return url;
  } catch {
    console.error("[indexer] Geçersiz BASE_RPC_URL (https olmalı) — public RPC'ye düşülüyor");
    return DEFAULT_BASE_RPC;
  }
}

function makeBaseClient() {
  return createPublicClient({
    chain: base,
    transport: http(resolveRpcUrl()),
  });
}
type BaseClient = ReturnType<typeof makeBaseClient>;
import type { PnLProvider } from "./provider";
import type { RawPnL, RawTrade } from "./types";
import {
  TRANSFER_EVENT,
  ERC20_META_ABI,
  QUOTE_TOKENS,
  isQuoteToken,
  BLOCKS_PER_DAY,
  CHUNK_BLOCKS,
  MAX_SCAN_BLOCKS,
} from "./dex/abi";

// ---- Saf hesap tipleri (RPC'den bağımsız → self-test edilebilir) ----

/** Tek bir tx içinde cüzdanın bir tokendaki net hareketi (ham wei/units). */
type TokenDelta = {
  token: string; // lowercase adres
  /** Net miktar: + giriş (alındı), - çıkış (satıldı). Ham (decimals uygulanmamış). */
  netRaw: bigint;
};

/** Bir tx'in trade olarak sadeleştirilmiş hali (FIFO girdisi). */
export type SwapEvent = {
  hash: string;
  minedAt: number; // unix ms
  blockNumber: bigint;
  /** Blok içi tx sırası — aynı blokta FIFO sıralaması için. */
  txIndex: number;
  /** Alınan (in) token adresi + ham miktar. */
  boughtToken: string;
  boughtRaw: bigint;
  /** Satılan (out) token adresi + ham miktar. */
  soldToken: string;
  soldRaw: bigint;
};

/** FIFO maliyet-bazı lotu: bir non-quote token'dan alınan miktar ve USD maliyeti. */
type Lot = {
  /** Kalan token miktarı (ham units). */
  remainingRaw: bigint;
  /** Bu lotun toplam USD maliyeti (alımda harcanan USDC). */
  costUsd: number;
  /** Lot oluşturulduğunda alınan toplam ham miktar (orantı için). */
  totalRaw: bigint;
};

/** FIFO sonucu. */
export type FifoResult = {
  realizedPnlUsd: number;
  /** Hâlâ konuşlu (açık lotlarda kilitli) toplam USD maliyeti. */
  netInvestedUsd: number;
  /** Kapanan pozisyonların FIFO ile eşleşen toplam maliyeti — ROI paydası. */
  matchedCostUsd: number;
};

// ---------------------------------------------------------------------------
// SAF FIFO ÇEKİRDEĞİ (RPC bağımsız — synthetic veriyle test edilebilir)
// ---------------------------------------------------------------------------

/**
 * USDC-quote'lu swap'lardan FIFO gerçekleşmiş PnL hesaplar.
 *
 * Mantık (kronolojik sıralı `swaps` beklenir):
 *  - USDC ile token ALIMI  → yeni lot aç (cost = harcanan USDC).
 *  - Token'ı USDC'ye SATIŞ → en eski lotlardan FIFO tüket;
 *      realized += satış USDC - tüketilen lotların orantılı maliyeti.
 *  - USDC bacağı olmayan swap → PnL'e dokunma (kısıt gereği).
 *
 * @param decimalsOf token adresi -> ondalık (quote tokenlar için QUOTE_TOKENS).
 */
export function computeFifoPnL(
  swaps: SwapEvent[],
  decimalsOf: (token: string) => number
): FifoResult {
  // token adresi -> açık lot kuyruğu (FIFO).
  const lots = new Map<string, Lot[]>();
  let realizedPnlUsd = 0;
  let matchedCostUsd = 0;

  /** Ham miktarı insan-okunur sayıya çevir (USD değeri için). */
  const toUnits = (raw: bigint, dec: number): number => {
    // Hassasiyet için stringe çevirip böl; çok büyük değerlerde Number yeterli.
    return Number(raw) / 10 ** dec;
  };

  const ordered = [...swaps].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    // Aynı blok: blok zaman damgası eşit olduğundan tx sırasıyla ayır.
    return a.txIndex - b.txIndex;
  });

  for (const s of ordered) {
    const boughtIsQuote = isQuoteToken(s.boughtToken);
    const soldIsQuote = isQuoteToken(s.soldToken);

    // Yalnızca tam olarak bir bacağı quote olan trade'ler PnL'e girer.
    if (boughtIsQuote === soldIsQuote) continue;

    if (soldIsQuote && !boughtIsQuote) {
      // USDC harcandı, token alındı → yeni lot.
      const costUsd = toUnits(s.soldRaw, decimalsOf(s.soldToken));
      const q = lots.get(s.boughtToken) ?? [];
      q.push({ remainingRaw: s.boughtRaw, costUsd, totalRaw: s.boughtRaw });
      lots.set(s.boughtToken, q);
    } else {
      // Token satıldı, USDC alındı → FIFO ile maliyeti düş.
      const proceedsUsd = toUnits(s.boughtRaw, decimalsOf(s.boughtToken));
      const q = lots.get(s.soldToken) ?? [];
      const soldTotal = s.soldRaw;
      let toSell = s.soldRaw;
      let matchedCost = 0;

      while (toSell > 0n && q.length > 0) {
        const lot = q[0];
        if (lot.remainingRaw <= toSell) {
          // Lot tamamen tükendi.
          matchedCost += lot.costUsd * (Number(lot.remainingRaw) / Number(lot.totalRaw));
          toSell -= lot.remainingRaw;
          q.shift();
        } else {
          // Lot kısmen tüketildi.
          const consumedFrac = Number(toSell) / Number(lot.totalRaw);
          matchedCost += lot.costUsd * consumedFrac;
          lot.remainingRaw -= toSell;
          toSell = 0n;
        }
      }
      lots.set(s.soldToken, q);

      // YALNIZCA FIFO ile eşleşen miktarın geliri gerçekleşmiş PnL'e girer.
      // Eşleşmeyen kısım (pencere öncesi veya token-için-token edinilmiş, maliyeti
      // bilinmeyen pozisyon) HARİÇ tutulur — aksi halde maliyetsiz "saf kâr" gibi
      // sayılır ve ROI manipüle edilebilir/şişer.
      const matchedRaw = soldTotal - toSell;
      const matchedProceeds =
        soldTotal > 0n ? proceedsUsd * (Number(matchedRaw) / Number(soldTotal)) : 0;
      realizedPnlUsd += matchedProceeds - matchedCost;
      matchedCostUsd += matchedCost;
    }
  }

  // Açık lotlarda kilitli kalan maliyet = hâlâ konuşlu sermaye.
  let netInvestedUsd = 0;
  for (const q of lots.values()) {
    for (const lot of q) {
      netInvestedUsd += lot.costUsd * (Number(lot.remainingRaw) / Number(lot.totalRaw));
    }
  }

  return { realizedPnlUsd, netInvestedUsd, matchedCostUsd };
}

// ---------------------------------------------------------------------------
// RPC KATMANI
// ---------------------------------------------------------------------------

type TransferLog = Log<bigint, number, false, typeof TRANSFER_EVENT, true>;

export class IndexerProvider implements PnLProvider {
  readonly id = "indexer" as const;

  async getWalletPnL(
    address: string,
    opts: { windowDays: number }
  ): Promise<RawPnL> {
    const addr = getAddress(address); // checksum; throw on invalid
    const lower = addr.toLowerCase();

    const client = makeBaseClient();

    // 1) Pencere için blok aralığı.
    const latest = await client.getBlockNumber();
    let span = BigInt(Math.max(1, Math.floor(opts.windowDays)) * BLOCKS_PER_DAY);
    if (span > MAX_SCAN_BLOCKS) span = MAX_SCAN_BLOCKS;
    const fromBlock = latest > span ? latest - span : 0n;

    // 2) Transfer loglarını topla (cüzdan from VEYA to).
    const logs = await this.collectTransferLogs(client, lower as Address, fromBlock, latest);

    // 3) Logları tx bazında grupla, net token deltası çıkar.
    const swaps = await this.buildSwaps(client, lower, logs);

    // 4) Token sembollerini çöz (cache'li).
    const decimalsCache = new Map<string, number>();
    const symbolCache = new Map<string, string>();
    seedQuoteCaches(decimalsCache, symbolCache);
    await this.resolveTokenMeta(client, swaps, decimalsCache, symbolCache);

    // 5) FIFO PnL.
    const fifo = computeFifoPnL(swaps, (t) => decimalsCache.get(t.toLowerCase()) ?? 18);

    // 6) RawTrade listesi.
    const trades = this.toRawTrades(swaps, decimalsCache, symbolCache);

    // 7) RawPnL derle.
    const realized = round2(fifo.realizedPnlUsd);
    const netInvested = round2(fifo.netInvestedUsd);
    const unrealized = 0; // MVP: oracle yok (bkz. dosya başı kısıt).
    const total = round2(realized + unrealized);
    // ROI paydası = kapanan pozisyonların maliyeti (matchedCost). Açık-lot
    // maliyetine bölmek, tüm pozisyonlarını kapatmış cüzdanda ROI'yi yanlışça
    // 0 gösterirdi.
    const matchedCost = fifo.matchedCostUsd;
    const realizedRoi = matchedCost > 0 ? round2((realized / matchedCost) * 100) : 0;
    const totalRoi = matchedCost > 0 ? round2((total / matchedCost) * 100) : 0;

    return {
      address: lower,
      source: this.id,
      realizedPnlUsd: realized,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: total,
      netInvestedUsd: netInvested,
      totalFeesUsd: 0, // gas USD'ye çevirmek oracle ister → 0.
      realizedRoiPct: realizedRoi,
      totalRoiPct: totalRoi,
      trades,
    };
  }

  /**
   * Cüzdanın from veya to olduğu ERC-20 Transfer loglarını chunk'lar halinde
   * tarar. Her chunk için iki getLogs (from-indexed, to-indexed). Hatalı chunk
   * atlanır (RPC limitine takılan aralıkları sessizce yutmamak için sayar).
   */
  private async collectTransferLogs(
    client: BaseClient,
    wallet: Address,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<TransferLog[]> {
    const out: TransferLog[] = [];
    for (let start = fromBlock; start <= toBlock; start += CHUNK_BLOCKS) {
      const end = start + CHUNK_BLOCKS - 1n > toBlock ? toBlock : start + CHUNK_BLOCKS - 1n;
      await this.fetchRange(client, wallet, start, end, out, 0);
    }
    return out;
  }

  /**
   * Bir blok aralığının Transfer loglarını çeker; RPC hata verirse aralığı ikiye
   * bölerek yeniden dener (range/rate limiti). FIFO tam ve sıralı geçmiş gerektirir:
   * başarısız aralığı SESSİZCE ATLAMAK eksik buy lot'ları yüzünden satışları
   * "maliyetsiz kâr" gibi gösterir ve sonucu deterministik olmaktan çıkarır. Bu
   * yüzden tek bloğa kadar inip hâlâ başarısızsa tüm isteği başarısız kılarız.
   */
  private async fetchRange(
    client: BaseClient,
    wallet: Address,
    start: bigint,
    end: bigint,
    out: TransferLog[],
    depth: number
  ): Promise<void> {
    try {
      const [asSender, asReceiver] = await Promise.all([
        client.getLogs({ event: TRANSFER_EVENT, args: { from: wallet }, fromBlock: start, toBlock: end }),
        client.getLogs({ event: TRANSFER_EVENT, args: { to: wallet }, fromBlock: start, toBlock: end }),
      ]);
      out.push(...(asSender as TransferLog[]), ...(asReceiver as TransferLog[]));
    } catch (err) {
      if (end > start && depth < 24) {
        const mid = start + (end - start) / 2n;
        await this.fetchRange(client, wallet, start, mid, out, depth + 1);
        await this.fetchRange(client, wallet, mid + 1n, end, out, depth + 1);
        return;
      }
      throw new Error(
        `Base RPC log taraması başarısız (blok ${start}-${end}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Logları tx bazında gruplar; her tx için cüzdanın token bazında net
   * deltasını hesaplar. Tam bir giriş + tam bir çıkış (en büyük mutlak değerli)
   * = swap. Tek yönlü transferler (deposit/withdraw) trade DEĞİLDİR → atlanır.
   */
  private async buildSwaps(
    client: BaseClient,
    wallet: string,
    logs: TransferLog[]
  ): Promise<SwapEvent[]> {
    // tx hash -> (token -> net delta)
    const byTx = new Map<string, Map<string, bigint>>();
    const blockOfTx = new Map<string, bigint>();
    const txIndexOfTx = new Map<string, number>();

    for (const log of logs) {
      const hash = log.transactionHash;
      if (!hash) continue;
      const token = log.address.toLowerCase();
      const from = (log.args.from ?? "").toLowerCase();
      const to = (log.args.to ?? "").toLowerCase();
      const value = log.args.value ?? 0n;

      // self-transfer (from==to==wallet) net etkisi sıfır → atla.
      let delta = 0n;
      if (to === wallet) delta += value;
      if (from === wallet) delta -= value;
      if (delta === 0n) continue;

      let m = byTx.get(hash);
      if (!m) {
        m = new Map();
        byTx.set(hash, m);
        if (log.blockNumber != null) blockOfTx.set(hash, log.blockNumber);
        txIndexOfTx.set(hash, log.transactionIndex ?? 0);
      }
      m.set(token, (m.get(token) ?? 0n) + delta);
    }

    // Blok -> zaman damgası cache (aynı blok birden çok tx'te tekrar gelebilir).
    const blockTime = new Map<bigint, number>();
    const swaps: SwapEvent[] = [];

    for (const [hash, deltas] of byTx) {
      // Net giriş ve net çıkış tokenlarını ayır.
      const ins: TokenDelta[] = [];
      const outs: TokenDelta[] = [];
      for (const [token, net] of deltas) {
        if (net > 0n) ins.push({ token, netRaw: net });
        else if (net < 0n) outs.push({ token, netRaw: net });
      }
      // Swap = en az bir giriş VE en az bir çıkış. Tek yönlü ise atla.
      if (ins.length === 0 || outs.length === 0) continue;

      // Bacak seçimi: PnL yalnızca USDC-quote'lu trade'lerden hesaplandığı için
      // bir tarafta quote token varsa onu seç (çok-bacaklı/dust içeren routed
      // swap'larda en büyük bacağı körlemesine almak quote'u kaçırıp yanlış
      // fiyatlamaya yol açar). Quote yoksa en büyük mutlak bacağı al.
      const bought =
        ins.find((d) => isQuoteToken(d.token)) ??
        ins.reduce((a, b) => (b.netRaw > a.netRaw ? b : a));
      const sold =
        outs.find((d) => isQuoteToken(d.token)) ??
        outs.reduce((a, b) => (b.netRaw < a.netRaw ? b : a));

      const blockNumber = blockOfTx.get(hash) ?? 0n;
      let minedAt = blockTime.get(blockNumber);
      if (minedAt == null) {
        minedAt = await this.safeBlockTimeMs(client, blockNumber);
        blockTime.set(blockNumber, minedAt);
      }

      swaps.push({
        hash,
        minedAt,
        blockNumber,
        txIndex: txIndexOfTx.get(hash) ?? 0,
        boughtToken: bought.token,
        boughtRaw: bought.netRaw,
        soldToken: sold.token,
        soldRaw: -sold.netRaw, // pozitife çevir
      });
    }

    return swaps;
  }

  /** Blok zaman damgası (ms). Hata olursa 0. */
  private async safeBlockTimeMs(
    client: BaseClient,
    blockNumber: bigint
  ): Promise<number> {
    if (blockNumber === 0n) return 0;
    try {
      const b = await client.getBlock({ blockNumber });
      return Number(b.timestamp) * 1000;
    } catch {
      return 0;
    }
  }

  /**
   * Swap'larda geçen tüm non-quote tokenlar için symbol() ve decimals() çözer.
   * multicall ile tek RPC turunda; cache'e yazar. Hata → makul fallback.
   */
  private async resolveTokenMeta(
    client: BaseClient,
    swaps: SwapEvent[],
    decimalsCache: Map<string, number>,
    symbolCache: Map<string, string>
  ): Promise<void> {
    const tokens = new Set<string>();
    for (const s of swaps) {
      tokens.add(s.boughtToken);
      tokens.add(s.soldToken);
    }
    const need = [...tokens].filter((t) => !symbolCache.has(t) || !decimalsCache.has(t));
    if (need.length === 0) return;

    const contracts = need.flatMap((t) => [
      { address: t as Address, abi: ERC20_META_ABI, functionName: "symbol" as const },
      { address: t as Address, abi: ERC20_META_ABI, functionName: "decimals" as const },
    ]);

    try {
      const results = await client.multicall({ contracts, allowFailure: true });
      need.forEach((t, i) => {
        const sym = results[i * 2];
        const dec = results[i * 2 + 1];
        symbolCache.set(
          t,
          sym?.status === "success" ? String(sym.result) : shortAddr(t)
        );
        decimalsCache.set(
          t,
          dec?.status === "success" ? Number(dec.result) : 18
        );
      });
    } catch {
      // multicall tamamen başarısızsa fallback.
      for (const t of need) {
        if (!symbolCache.has(t)) symbolCache.set(t, shortAddr(t));
        if (!decimalsCache.has(t)) decimalsCache.set(t, 18);
      }
    }
  }

  /** SwapEvent[] → RawTrade[]. USD değeri yalnız USDC-bacaklı trade'lerde dolar. */
  private toRawTrades(
    swaps: SwapEvent[],
    decimalsCache: Map<string, number>,
    symbolCache: Map<string, string>
  ): RawTrade[] {
    const decOf = (t: string) => decimalsCache.get(t.toLowerCase()) ?? 18;
    const symOf = (t: string) => symbolCache.get(t.toLowerCase()) ?? shortAddr(t);

    return swaps
      .map((s): RawTrade => {
        const boughtIsQuote = isQuoteToken(s.boughtToken);
        const soldIsQuote = isQuoteToken(s.soldToken);
        // USD hacmi: hangi bacak quote ise onun miktarı. Aksi halde 0 (oracle yok).
        let valueUsd = 0;
        if (soldIsQuote && !boughtIsQuote) {
          valueUsd = Number(s.soldRaw) / 10 ** decOf(s.soldToken);
        } else if (boughtIsQuote && !soldIsQuote) {
          valueUsd = Number(s.boughtRaw) / 10 ** decOf(s.boughtToken);
        }
        return {
          hash: s.hash,
          minedAt: s.minedAt,
          status: "confirmed", // log mevcut → tx başarılı/madenlenmiş.
          isTrash: false, // onchain decode; spam listesi tutmuyoruz.
          // Bilinen quote-pair ise doğrulanmış kabul (best-effort).
          hasVerifiedAsset: boughtIsQuote || soldIsQuote,
          valueUsd: round2(valueUsd),
          soldSymbol: symOf(s.soldToken),
          boughtSymbol: symOf(s.boughtToken),
        };
      })
      .sort((a, b) => b.minedAt - a.minedAt);
  }
}

// ---- yardımcılar ----

/** Quote tokenların symbol/decimals değerlerini cache'e önceden yükle. */
function seedQuoteCaches(
  decimalsCache: Map<string, number>,
  symbolCache: Map<string, string>
): void {
  for (const [addr, meta] of Object.entries(QUOTE_TOKENS)) {
    decimalsCache.set(addr, meta.decimals);
    symbolCache.set(addr, meta.symbol);
  }
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
