/**
 * Veri katmanı tipleri. Sağlayıcıdan bağımsız (provider-agnostic): Zerion da
 * Faz 2'deki kendi indexer'ımız da bu tipleri üretir, böylece uygulama kodu
 * sağlayıcı değişiminden etkilenmez.
 */

export type ProviderId = "zerion" | "indexer";

/** Tek bir gerçek (swap) işleminin sadeleştirilmiş kaydı — gürültü temizleme öncesi. */
export type RawTrade = {
  hash: string;
  /** unix ms */
  minedAt: number;
  status: "confirmed" | "failed" | "pending";
  /** Zerion/indexer'ın spam/çöp bayrağı. */
  isTrash: boolean;
  /** İşleme konu fungible varlıklardan en az biri doğrulanmış mı? */
  hasVerifiedAsset: boolean;
  /** İşlemin yaklaşık USD hacmi (giren/çıkan transferlerin değer toplamı). */
  valueUsd: number;
  /** Satılan (out) varlık sembolü — churn/round-trip tespiti için. */
  soldSymbol: string;
  /** Alınan (in) varlık sembolü. */
  boughtSymbol: string;
};

/** Sağlayıcının ham PnL çıktısı (henüz skor/rozet hesaplanmamış). */
export type RawPnL = {
  address: string;
  source: ProviderId;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  netInvestedUsd: number;
  totalFeesUsd: number;
  /** Zerion'un FIFO ile hesapladığı gerçekleşmiş ROI yüzdesi. */
  realizedRoiPct: number;
  totalRoiPct: number;
  /** Gürültü temizleme/sayım için işlem listesi (varsa). */
  trades: RawTrade[];
};

/**
 * Manipülasyon/şişirme sinyali. Karşı-taraf verisi olmadan kesin "wash trading"
 * iddiası yapılamaz; bunun yerine wash/airdrop-farming şişirmesine eşlik eden
 * davranış örüntülerini (hızlı round-trip churn, tek-pair yoğunlaşması) ölçer.
 */
export type IntegritySignal = {
  /** Aynı varlıkta kısa sürede al-sat (round-trip) oranı, %. */
  churnRatioPct: number;
  /** En çok işlem gören tek token-çiftinin toplam içindeki payı, %. */
  topPairConcentrationPct: number;
  /** Heuristiklere göre şüpheli hacim şişirmesi var mı? */
  suspicious: boolean;
  /** Özet etiket — kartta gösterilir. */
  label: "clean" | "watch" | "flagged";
};

/** Uygulamanın her yerde kullandığı normalize edilmiş PnL. */
export type NormalizedPnL = {
  address: string;
  chain: "base";
  provider: ProviderId;
  /** İşlem aktivitesi penceresi (gün). */
  windowDays: number;

  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  netInvestedUsd: number;
  totalFeesUsd: number;

  /** Headline ROI (gerçekleşmiş, FIFO). */
  roiPct: number;

  /** Gürültü temizliği sonrası gerçek swap sayısı. */
  tradeCount: number;
  /** Pencere içindeki gerçek swap sayısı. */
  tradeCountInWindow: number;
  /** Spam/çöp olarak elenen işlem sayısı (şeffaflık için). */
  noiseFilteredCount: number;

  /** unix ms */
  computedAt: number;

  /** Faz 4: hesaplama girdisi tx hash kümesinin deterministik hash'i. */
  proofHash: string;

  /** Faz 4: manipülasyon/şişirme sinyali. */
  integrity: IntegritySignal;
};
