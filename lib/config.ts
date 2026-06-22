/**
 * Merkezi uygulama yapılandırması. Tüm env okumaları buradan geçer ki
 * eksik değerlerde makul fallback'ler tek yerde yönetilsin.
 */

export const APP_URL =
  process.env.NEXT_PUBLIC_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PnL Pasaportu";

export const APP_DESCRIPTION =
  "Cüzdanını bağla, Base'teki gerçek onchain PnL'ini kanıtla ve kartını cast'le.";

export const ONCHAINKIT_API_KEY =
  process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || "";

/** PnL hesabının baz aldığı pencere (gün). Kartta "son N gün" olarak gösterilir. */
export const PNL_WINDOW_DAYS = 90;

/** Base mainnet chain id — MVP yalnızca Base. */
export const BASE_CHAIN_ID = 8453;
