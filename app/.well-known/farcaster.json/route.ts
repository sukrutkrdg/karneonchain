import { APP_URL, APP_NAME, APP_DESCRIPTION } from "@/lib/config";

/**
 * Mini App manifest'i: hem Base App hem Farcaster için keşif, embed ve sahiplik
 * ispatı sağlar. `accountAssociation` gerçek deploy domain'i ile imzalanmalıdır
 * (`npx create-onchain --manifest` bu üçlüyü üretir). İmza yoksa uygulama yerelde
 * çalışır ama mağaza/keşifte doğrulanmaz.
 */
export async function GET() {
  const manifest = {
    accountAssociation: {
      header: process.env.FARCASTER_HEADER || "",
      payload: process.env.FARCASTER_PAYLOAD || "",
      signature: process.env.FARCASTER_SIGNATURE || "",
    },
    // Hem güncel ("miniapp") hem eski ("frame") anahtar adı; istemciler birine düşer.
    miniapp: buildEmbed(),
    frame: buildEmbed(),
  };

  return Response.json(manifest);
}

function buildEmbed() {
  return {
    version: "1",
    name: APP_NAME,
    subtitle: "Kanıtlanmış onchain PnL",
    description: APP_DESCRIPTION,
    iconUrl: `${APP_URL}/icon.png`,
    homeUrl: APP_URL,
    imageUrl: `${APP_URL}/api/card`,
    splashImageUrl: `${APP_URL}/splash.png`,
    splashBackgroundColor: "#0b0e14",
    primaryCategory: "finance",
    tags: ["pnl", "trading", "base", "defi", "reputation"],
  };
}
