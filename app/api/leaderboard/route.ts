import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { getTop, recordWallet, getRank } from "@/lib/leaderboard";
import { getNormalizedPnL, InvalidAddressError } from "@/lib/pnl/service";
import { rateLimit, clientKey, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * GET /api/leaderboard?metric=roi|score&limit=50
 * Seçilen metriğe göre üst trader listesini döndürür.
 */
export async function GET(req: NextRequest) {
  const metricParam = req.nextUrl.searchParams.get("metric");
  const limitParam = req.nextUrl.searchParams.get("limit");

  // Metrik doğrulama — bilinmeyenleri 'score' olarak ele al
  const metric: "roi" | "score" =
    metricParam === "roi" ? "roi" : "score";

  const limit = limitParam
    ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50))
    : 50;

  try {
    const snapshots = await getTop(metric, limit);
    return Response.json({ metric, limit, data: snapshots });
  } catch (err) {
    console.error("[/api/leaderboard GET]", err);
    return Response.json({ error: "Liderboard alınamadı" }, { status: 500 });
  }
}

/**
 * POST /api/leaderboard  { "address": "0x..." }
 * Cüzdanın PnL'ini hesaplar, liderboard'a kaydeder ve güncel sırasını döndürür.
 */
export async function POST(req: NextRequest) {
  // Yazma + pahalı hesaplama → sıkı limit (kimliksiz; Faz 2'de auth eklenecek).
  const rl = await rateLimit(`lb-post:${clientKey(req)}`, 10, 60);
  if (!rl.ok) return tooMany();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  const address =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).address
      : undefined;
  // Pahalı işe girmeden adresi erken doğrula.
  if (typeof address !== "string" || !isAddress(address)) {
    return Response.json({ error: "Geçerli bir 'address' gerekli" }, { status: 400 });
  }

  try {
    // PnL çek ve liderboard'a kaydet
    const pnl = await getNormalizedPnL(address);
    await recordWallet(pnl);

    // Her iki metrikte de sırayı hesapla
    const [rankRoi, rankScore] = await Promise.all([
      getRank(address, "roi"),
      getRank(address, "score"),
    ]);

    // Snapshot'ı PnL verisinden doğrudan oluştur
    const snapshot = {
      address: address.toLowerCase(),
      roiPct: pnl.roiPct,
      realizedPnlUsd: pnl.realizedPnlUsd,
      tradeCount: pnl.tradeCount,
      integrityLabel: pnl.integrity.label,
    };

    return Response.json({
      snapshot,
      rank: { roi: rankRoi, score: rankScore },
    });
  } catch (err) {
    if (err instanceof InvalidAddressError) {
      return Response.json({ error: "Geçersiz adres" }, { status: 400 });
    }
    console.error("[/api/leaderboard POST]", err);
    return Response.json({ error: "Liderboard kaydı başarısız" }, { status: 502 });
  }
}
