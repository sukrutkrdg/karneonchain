"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "wagmi/chains";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { ONCHAINKIT_API_KEY, APP_NAME } from "@/lib/config";

/**
 * Sağlayıcı zinciri: WagmiProvider → QueryClient → OnchainKitProvider.
 * OnchainKit 1.x'te `miniKit={{ enabled: true }}` MiniKit bağlamını dahili sarar,
 * böylece uygulama hem Base App hem Farcaster'da Mini App olarak çalışır; harici
 * tarayıcıda da OnchainKit cüzdan akışına düşer.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={ONCHAINKIT_API_KEY}
          chain={base}
          miniKit={{ enabled: true }}
          config={{
            appearance: {
              name: APP_NAME,
              mode: "dark",
              theme: "default",
            },
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
