import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { getNormalizedPnL, InvalidAddressError } from "@/lib/pnl/service";
import { parseWindowDays } from "@/lib/config";
import { rateLimit, clientKey, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * GET /api/pnl?address=0x...&window=90
 * Cüzdanın normalize edilmiş, Base spot DEX PnL'ini döndürür.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(`pnl:${clientKey(req)}`, 30, 60);
  if (!rl.ok) return tooMany();

  const address = req.nextUrl.searchParams.get("address");
  const windowDays = parseWindowDays(req.nextUrl.searchParams.get("window"));

  // Erken sınır kontrolü: geçersiz girdiyi pahalı işe girmeden reddet.
  if (!address || !isAddress(address)) {
    return Response.json({ error: "Geçerli bir address gerekli" }, { status: 400 });
  }

  try {
    const pnl = await getNormalizedPnL(address, { windowDays });
    return Response.json(pnl);
  } catch (err) {
    if (err instanceof InvalidAddressError) {
      return Response.json({ error: "Geçersiz adres" }, { status: 400 });
    }
    // İç hata detayını client'a sızdırma; sunucuda logla.
    console.error("[/api/pnl]", err);
    return Response.json({ error: "PnL alınamadı" }, { status: 502 });
  }
}
