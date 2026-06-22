import type { PnLProvider } from "./provider";
import type { RawPnL, RawTrade } from "./types";

const ZERION_BASE = "https://api.zerion.io/v1";

/** Zerion REST hatalarını anlamlı mesaja çevirmek için. */
class ZerionError extends Error {}

function authHeader(): string {
  const key = process.env.ZERION_API_KEY;
  if (!key) {
    throw new ZerionError(
      "ZERION_API_KEY tanımlı değil. .env dosyasına ekleyin."
    );
  }
  // Zerion: API anahtarı kullanıcı adı, parola boş → Basic base64(key:)
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

async function zfetch<T>(pathOrUrl: string): Promise<T> {
  // links.next mutlak URL döner; path verilirse base'i ekle.
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${ZERION_BASE}${pathOrUrl}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: authHeader(),
    },
    // PnL nadiren saniye-saniye değişir; kısa edge cache makul.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ZerionError(`Zerion ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

// ---- Zerion yanıt şekilleri (yalnız kullandığımız alanlar) ----

type PnLResponse = {
  data?: {
    attributes?: {
      total_gain?: number;
      realized_gain?: number;
      unrealized_gain?: number;
      relative_total_gain_percentage?: number;
      relative_realized_gain_percentage?: number;
      total_fee?: number;
      net_invested?: number;
    };
  };
};

type TxResponse = {
  data?: Array<{
    attributes?: {
      operation_type?: string;
      hash?: string;
      mined_at?: string;
      status?: string;
      flags?: { is_trash?: boolean };
      transfers?: Array<{
        direction?: "in" | "out" | "self";
        value?: number | null;
        fungible_info?: { symbol?: string; flags?: { verified?: boolean } };
      }>;
    };
  }>;
  links?: { next?: string };
};

export class ZerionProvider implements PnLProvider {
  readonly id = "zerion" as const;

  async getWalletPnL(
    address: string,
    opts: { windowDays: number }
  ): Promise<RawPnL> {
    const addr = address.toLowerCase();

    // PnL özeti ve işlem listesini paralel çek.
    const [pnl, trades] = await Promise.all([
      zfetch<PnLResponse>(
        `/wallets/${addr}/pnl?currency=usd&filter[chain_ids]=base`
      ),
      this.fetchTrades(addr, opts.windowDays),
    ]);

    const a = pnl.data?.attributes ?? {};
    const realized = num(a.realized_gain);
    const unrealized = num(a.unrealized_gain);

    return {
      address: addr,
      source: this.id,
      realizedPnlUsd: realized,
      unrealizedPnlUsd: unrealized,
      totalPnlUsd: num(a.total_gain) || realized + unrealized,
      netInvestedUsd: num(a.net_invested),
      totalFeesUsd: num(a.total_fee),
      realizedRoiPct: num(a.relative_realized_gain_percentage),
      totalRoiPct: num(a.relative_total_gain_percentage),
      trades,
    };
  }

  /**
   * Base zincirinde, pencere içindeki gerçek swap işlemleri.
   * `links.next` ile sayfalanır (tek sayfa 100 ile kesilirse tradeCount/churn/
   * proofHash bozuk küme üzerinden hesaplanırdı). Güvenlik için sayfa ve
   * toplam-trade sınırı var; yalnızca pencere içindeki `confirmed` trade'ler.
   */
  private async fetchTrades(
    addr: string,
    windowDays: number
  ): Promise<RawTrade[]> {
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const sinceSec = Math.floor(since / 1000);

    let url: string | undefined =
      `/wallets/${addr}/transactions/?currency=usd` +
      `&filter[chain_ids]=base&filter[operation_types]=trade` +
      `&filter[min_mined_at]=${sinceSec}&page[size]=100`;

    const MAX_PAGES = 10; // <= 1000 trade; aşırı aktif cüzdanlarda DoS/maliyet sınırı.
    const MAX_TRADES = 1000;
    const out: RawTrade[] = [];

    for (let page = 0; page < MAX_PAGES && url; page++) {
      const res: TxResponse = await zfetch<TxResponse>(url);
      for (const t of res.data ?? []) {
        const at = t.attributes ?? {};
        // Yalnızca onaylanmış işlemler — pending/failed proofHash'i ve
        // heuristikleri bozar.
        if (at.status && at.status !== "confirmed") continue;
        const transfers = at.transfers ?? [];
        const hasVerifiedAsset = transfers.some(
          (x) => x.fungible_info?.flags?.verified === true
        );
        // Trade hacmi: tek "in" bacağın USD değeri (toplamak çoklu-in/dust'ı
        // şişirir). En büyük tek in-leg değeri.
        const valueUsd = transfers
          .filter((x) => x.direction === "in")
          .reduce((max, x) => Math.max(max, Math.abs(num(x.value))), 0);
        const boughtSymbol =
          transfers.find((x) => x.direction === "in")?.fungible_info?.symbol ?? "";
        const soldSymbol =
          transfers.find((x) => x.direction === "out")?.fungible_info?.symbol ?? "";
        const minedAt = at.mined_at ? Date.parse(at.mined_at) : 0;
        if (!at.hash || minedAt < since) continue;
        out.push({
          hash: at.hash,
          minedAt,
          status: "confirmed",
          isTrash: at.flags?.is_trash === true,
          hasVerifiedAsset,
          valueUsd,
          boughtSymbol,
          soldSymbol,
        });
        if (out.length >= MAX_TRADES) return out;
      }
      url = res.links?.next;
    }

    return out;
  }
}
