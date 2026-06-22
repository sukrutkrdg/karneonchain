import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { getNormalizedPnL, InvalidAddressError } from "@/lib/pnl/service";
import { getBadge, getReputationScore } from "@/lib/pnl/score";

export const runtime = "nodejs";

/**
 * GET /api/compare?a=0x...&b=0x...
 * İki cüzdanı karşılaştırır: PnL, rozet ve itibar skorunu yan yana döndürür;
 * kazananı itibar skoruna göre (beraberlikte roiPct'e göre) belirler.
 */
export async function GET(req: NextRequest) {
  const addrA = req.nextUrl.searchParams.get("a");
  const addrB = req.nextUrl.searchParams.get("b");

  // Her iki parametre de zorunlu.
  if (!addrA || !addrB) {
    return Response.json(
      { error: "a ve b parametreleri zorunlu (0x... adresi)" },
      { status: 400 }
    );
  }

  // Adres formatı doğrulama — isAddress viem'den gelir.
  if (!isAddress(addrA)) {
    return Response.json(
      { error: `Geçersiz adres (a): ${addrA}` },
      { status: 400 }
    );
  }
  if (!isAddress(addrB)) {
    return Response.json(
      { error: `Geçersiz adres (b): ${addrB}` },
      { status: 400 }
    );
  }

  // İki cüzdanı paralel olarak çek — cache + provider zinciri service katmanında.
  let pnlA, pnlB;
  try {
    [pnlA, pnlB] = await Promise.all([
      getNormalizedPnL(addrA),
      getNormalizedPnL(addrB),
    ]);
  } catch (err) {
    if (err instanceof InvalidAddressError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return Response.json(
      { error: "PnL alınamadı", detail: message },
      { status: 502 }
    );
  }

  const repA = getReputationScore(pnlA);
  const repB = getReputationScore(pnlB);
  const badgeA = getBadge(pnlA);
  const badgeB = getBadge(pnlB);

  // Kazanan belirleme: önce itibar skoru, beraberlikte roiPct.
  let winner: "a" | "b" | "tie";
  if (repA > repB) {
    winner = "a";
  } else if (repB > repA) {
    winner = "b";
  } else if (pnlA.roiPct > pnlB.roiPct) {
    winner = "a";
  } else if (pnlB.roiPct > pnlA.roiPct) {
    winner = "b";
  } else {
    winner = "tie";
  }

  return Response.json({
    a: { pnl: pnlA, reputation: repA, badge: badgeA },
    b: { pnl: pnlB, reputation: repB, badge: badgeB },
    winner,
  });
}
