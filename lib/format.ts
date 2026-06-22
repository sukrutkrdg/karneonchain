/** Kart ve bileşenlerde ortak biçimlendirme yardımcıları. */

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(n >= 100 || n <= -100 ? 0 : 1)}%`;
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

import type { IntegritySignal } from "@/lib/data/types";

/** Integrity etiketini gösterim metni + rengine çevirir (kart ve bileşenlerde ortak). */
export function integrityDisplay(integrity: IntegritySignal): {
  text: string;
  color: string;
} {
  switch (integrity.label) {
    case "flagged":
      return { text: "⚠ Şüpheli hacim", color: "#ef4444" };
    case "watch":
      return { text: "◔ İzlemede", color: "#f59e0b" };
    default:
      return { text: "✓ Doğrulanabilir", color: "#22c55e" };
  }
}
