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

async function zfetch<T>(path: string): Promise<T> {
  const res = await fetch(`${ZERION_BASE}${path}`, {
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

  /** Base zincirinde, pencere içindeki gerçek swap işlemleri. */
  private async fetchTrades(
    addr: string,
    windowDays: number
  ): Promise<RawTrade[]> {
    const res = await zfetch<TxResponse>(
      `/wallets/${addr}/transactions/?currency=usd` +
        `&filter[chain_ids]=base&filter[operation_types]=trade&page[size]=100`
    );

    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    return (res.data ?? [])
      .map((t): RawTrade => {
        const at = t.attributes ?? {};
        const transfers = at.transfers ?? [];
        const valueUsd = transfers
          .filter((x) => x.direction === "in")
          .reduce((sum, x) => sum + Math.abs(num(x.value)), 0);
        const hasVerifiedAsset = transfers.some(
          (x) => x.fungible_info?.flags?.verified === true
        );
        const boughtSymbol =
          transfers.find((x) => x.direction === "in")?.fungible_info?.symbol ?? "";
        const soldSymbol =
          transfers.find((x) => x.direction === "out")?.fungible_info?.symbol ?? "";
        return {
          hash: at.hash ?? "",
          minedAt: at.mined_at ? Date.parse(at.mined_at) : 0,
          status: (at.status as RawTrade["status"]) ?? "confirmed",
          isTrash: at.flags?.is_trash === true,
          hasVerifiedAsset,
          valueUsd,
          boughtSymbol,
          soldSymbol,
        };
      })
      .filter((t) => t.hash && t.minedAt >= since);
  }
}
