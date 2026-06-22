"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useMiniKit, useComposeCast } from "@coinbase/onchainkit/minikit";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { PnlCard } from "@/components/PnlCard";
import { APP_NAME, APP_URL } from "@/lib/config";
import type { NormalizedPnL } from "@/lib/data/types";

async function fetchPnl(address: string): Promise<NormalizedPnL> {
  const res = await fetch(`/api/pnl?address=${address}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || "PnL alınamadı");
  }
  return res.json();
}

export default function Home() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { composeCast } = useComposeCast();

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const { data: pnl, isLoading, error } = useQuery({
    queryKey: ["pnl", address],
    queryFn: () => fetchPnl(address as string),
    enabled: isConnected && !!address,
  });

  function shareCard() {
    if (!address) return;
    const shareUrl = `${APP_URL}/share/${address}`;
    composeCast({
      text:
        pnl && pnl.roiPct > 0
          ? `Onchain PnL'imi kanıtladım: ${formatRoi(pnl.roiPct)} ROI, son ${pnl.windowDays} gün. Base'te doğrulanabilir. 🛡️`
          : `Onchain PnL pasaportumu çıkardım. Sen de kendininkini kanıtla 🛡️`,
      embeds: [shareUrl],
    });
  }

  return (
    <main className="container">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>🛡️ {APP_NAME}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Cüzdanını bağla, Base&apos;teki gerçek, manipüle edilemez PnL&apos;ini
          kanıtla ve kartını cast&apos;le.
        </p>
      </header>

      {!isConnected && (
        <div className="card-surface" style={{ textAlign: "center" }}>
          <p style={{ marginTop: 0 }}>Başlamak için cüzdanını bağla.</p>
          <Wallet>
            <ConnectWallet />
          </Wallet>
        </div>
      )}

      {isConnected && isLoading && (
        <div className="card-surface">PnL hesaplanıyor… (Base işlemleri indeksleniyor)</div>
      )}

      {isConnected && error && (
        <div className="card-surface" style={{ borderColor: "var(--red)" }}>
          <strong>Hata:</strong> {(error as Error).message}
        </div>
      )}

      {isConnected && pnl && (
        <>
          <PnlCard pnl={pnl} />
          <button className="btn" style={{ marginTop: 16 }} onClick={shareCard}>
            Kartımı Cast&apos;le
          </button>
        </>
      )}
    </main>
  );
}

function formatRoi(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}%`;
}
