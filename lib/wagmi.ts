import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";
import farcasterMiniApp from "@farcaster/miniapp-wagmi-connector";
import { APP_NAME } from "./config";

/**
 * Tek wagmi yapılandırması — hem Farcaster Mini App içi (farcasterMiniApp
 * connector'ı host cüzdanını otomatik bağlar) hem de Base App / harici tarayıcı
 * (coinbaseWallet) için. MVP yalnızca Base mainnet.
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    farcasterMiniApp(),
    coinbaseWallet({ appName: APP_NAME, preference: "all" }),
  ],
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
