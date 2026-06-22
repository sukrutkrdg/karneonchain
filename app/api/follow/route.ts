/**
 * /api/follow — Sosyal grafik API'si.
 *
 * GET  ?trader=0x...&user=0x...
 *   → { followerCount, isFollowing, traderMeta, subscriberCount }
 *
 * POST { trader, user, action: 'follow' | 'unfollow' }
 *   → { followerCount, isFollowing }
 */

import { NextRequest } from "next/server";
import { isAddress } from "viem";
import {
  follow,
  unfollow,
  isFollowing,
  followerCount,
  getTraderMeta,
  subscriberCount,
} from "@/lib/follow";
import { rateLimit, clientKey, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";

// GÜVENLİK NOTU (Faz 2): `user` kimliği imzasızdır — herkes herkes adına takip
// edebilir. Gerçek koruma için SIWE/Farcaster Quick-Auth ile `user` doğrulanmalı.
// Şimdilik rate-limit ek katmandır, tek koruma değildir.

// ---------------------------------------------------------------------------
// GET /api/follow?trader=0x...&user=0x...
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const trader = req.nextUrl.searchParams.get("trader");
  const user = req.nextUrl.searchParams.get("user");

  if (!trader) {
    return Response.json(
      { error: "trader parametresi gerekli" },
      { status: 400 }
    );
  }

  if (!isAddress(trader)) {
    return Response.json(
      { error: `Geçersiz trader adresi: ${trader}` },
      { status: 400 }
    );
  }

  if (user && !isAddress(user)) {
    return Response.json(
      { error: `Geçersiz user adresi: ${user}` },
      { status: 400 }
    );
  }

  try {
    const [fCount, subCount, meta, following] = await Promise.all([
      followerCount(trader),
      subscriberCount(trader),
      getTraderMeta(trader),
      user ? isFollowing(user, trader) : Promise.resolve(false),
    ]);

    return Response.json({
      followerCount: fCount,
      isFollowing: following,
      traderMeta: meta,
      subscriberCount: subCount,
    });
  } catch (err) {
    console.error("[/api/follow GET]", err);
    return Response.json({ error: "Veri alınamadı" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/follow — takip et / takipten çık
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`follow:${clientKey(req)}`, 20, 60);
  if (!rl.ok) return tooMany();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }

  const { trader, user, action } = body as Record<string, unknown>;

  if (!trader || typeof trader !== "string") {
    return Response.json(
      { error: "trader alanı gerekli (string)" },
      { status: 400 }
    );
  }
  if (!user || typeof user !== "string") {
    return Response.json(
      { error: "user alanı gerekli (string)" },
      { status: 400 }
    );
  }
  if (action !== "follow" && action !== "unfollow") {
    return Response.json(
      { error: "action 'follow' veya 'unfollow' olmalı" },
      { status: 400 }
    );
  }

  if (!isAddress(trader)) {
    return Response.json(
      { error: `Geçersiz trader adresi: ${trader}` },
      { status: 400 }
    );
  }
  if (!isAddress(user)) {
    return Response.json(
      { error: `Geçersiz user adresi: ${user}` },
      { status: 400 }
    );
  }

  // Kullanıcı kendini takip edemez
  if (trader.toLowerCase() === user.toLowerCase()) {
    return Response.json(
      { error: "Kullanıcı kendini takip edemez" },
      { status: 400 }
    );
  }

  try {
    if (action === "follow") {
      await follow(user, trader);
    } else {
      await unfollow(user, trader);
    }

    const [fCount, following] = await Promise.all([
      followerCount(trader),
      isFollowing(user, trader),
    ]);

    return Response.json({
      followerCount: fCount,
      isFollowing: following,
    });
  } catch (err) {
    console.error("[/api/follow POST]", err);
    return Response.json({ error: "İşlem başarısız" }, { status: 500 });
  }
}
