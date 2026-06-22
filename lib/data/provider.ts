import type { RawPnL } from "./types";
import { ZerionProvider } from "./zerion";
import { IndexerProvider } from "./indexer";

/**
 * Hibrit veri stratejisinin teknik karşılığı: tüm sağlayıcılar bu arayüzü
 * implemente eder. Faz 1 = Zerion. Faz 2'de `lib/data/indexer.ts` (kendi Base
 * RPC log-decode katmanımız) aynı arayüzü implemente edip `PNL_PROVIDER=indexer`
 * ile devreye girer — uygulama kodu hiç değişmeden.
 */
export interface PnLProvider {
  readonly id: "zerion" | "indexer";
  getWalletPnL(
    address: string,
    opts: { windowDays: number }
  ): Promise<RawPnL>;
}

let cached: PnLProvider | null = null;

/** Aktif sağlayıcıyı env'e göre döndürür (singleton). */
export function getProvider(): PnLProvider {
  if (cached) return cached;

  const which = (process.env.PNL_PROVIDER || "zerion").toLowerCase();
  switch (which) {
    case "indexer":
      // Kendi Base RPC log-decode katmanımız (USDC-quoted FIFO realized PnL).
      cached = new IndexerProvider();
      return cached;
    case "zerion":
    default:
      cached = new ZerionProvider();
      return cached;
  }
}
