import type { Metadata } from "next";
import Link from "next/link";
import { isAddress } from "viem";
import { getNormalizedPnL } from "@/lib/pnl/service";
import { PnlCard } from "@/components/PnlCard";
import { APP_URL, APP_NAME } from "@/lib/config";

type Params = { params: Promise<{ address: string }> };

/**
 * Cast edilen kartın açılış sayfası. `fc:miniapp` / `fc:frame` embed meta'ları
 * sayesinde Farcaster/Base App feed'inde kart görseli + "Aç" butonu olarak
 * görünür; tıklayan Mini App'i bu adresin pasaportuyla açar.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  const cardUrl = `${APP_URL}/api/card?address=${address}`;
  const target = `${APP_URL}/share/${address}`;

  const launch = {
    name: APP_NAME,
    url: target,
    splashImageUrl: `${APP_URL}/splash.png`,
    splashBackgroundColor: "#0b0e14",
  };

  const miniapp = {
    version: "1",
    imageUrl: cardUrl,
    button: {
      title: "PnL'imi gör 🛡️",
      action: { type: "launch_miniapp", ...launch },
    },
  };
  // Eski istemciler için frame varyantı (action tipi launch_frame).
  const frame = {
    ...miniapp,
    button: { title: miniapp.button.title, action: { type: "launch_frame", ...launch } },
  };

  return {
    title: `${APP_NAME} — ${address}`,
    openGraph: { images: [cardUrl] },
    other: {
      "fc:miniapp": JSON.stringify(miniapp),
      "fc:frame": JSON.stringify(frame),
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { address } = await params;

  if (!isAddress(address)) {
    return (
      <main className="container">
        <div className="card-surface" style={{ borderColor: "var(--red)" }}>
          Geçersiz cüzdan adresi.
        </div>
      </main>
    );
  }

  let content;
  try {
    const pnl = await getNormalizedPnL(address);
    content = <PnlCard pnl={pnl} />;
  } catch {
    content = (
      <div className="card-surface">
        Bu cüzdan için PnL şu an hesaplanamadı. Daha sonra tekrar dene.
      </div>
    );
  }

  return (
    <main className="container">
      <h1 style={{ fontSize: 22 }}>🛡️ {APP_NAME}</h1>
      {content}
      <Link href="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
        Kendi pasaportunu çıkar
      </Link>
    </main>
  );
}
