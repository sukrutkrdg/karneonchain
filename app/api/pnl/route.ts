import { NextRequest } from "next/server";
import {
  getNormalizedPnL,
  InvalidAddressError,
} from "@/lib/pnl/service";

export const runtime = "nodejs";

/**
 * GET /api/pnl?address=0x...&window=90
 * Cüzdanın normalize edilmiş, Base spot DEX PnL'ini döndürür.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const windowParam = req.nextUrl.searchParams.get("window");
  const windowDays = windowParam ? parseInt(windowParam, 10) : undefined;

  if (!address) {
    return Response.json(
      { error: "address parametresi gerekli" },
      { status: 400 }
    );
  }

  try {
    const pnl = await getNormalizedPnL(address, { windowDays });
    return Response.json(pnl);
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
}
