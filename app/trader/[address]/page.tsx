/**
 * /trader/[address] — Trader profil sayfası.
 *
 * PnL kartı, itibar skoru, takipçi sayısı, FollowButton ve
 * "Kirala beni" ücretli alpha bölümünü içerir.
 *
 * Server Component — async params (Next.js 15 App Router).
 */

import type { Metadata } from "next";
import { isAddress } from "viem";
import { PnlCard } from "@/components/PnlCard";
import { FollowButton } from "@/components/FollowButton";
import { getNormalizedPnL } from "@/lib/pnl/service";
import { getReputationScore, getBadge } from "@/lib/pnl/score";
import { followerCount, getTraderMeta } from "@/lib/follow";
import { truncateAddress, formatUsd } from "@/lib/format";
import { APP_NAME } from "@/lib/config";

type Params = { params: Promise<{ address: string }> };

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  const display = isAddress(address) ? truncateAddress(address) : address;
  return {
    title: `${display} — Trader Profili | ${APP_NAME}`,
  };
}

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------

export default async function TraderPage({ params }: Params) {
  const { address } = await params;

  // Adres doğrulama
  if (!isAddress(address)) {
    return (
      <main className="container">
        <div className="card-surface" style={{ borderColor: "var(--red)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Geçersiz cüzdan adresi.</p>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Lütfen geçerli bir 0x adresiyle tekrar dene.
          </p>
        </div>
      </main>
    );
  }

  // PnL + sosyal grafik verilerini paralel çek
  const [pnlResult, fCount, meta] = await Promise.all([
    getNormalizedPnL(address).then(
      (pnl) => ({ ok: true as const, pnl }),
      (err: unknown) => ({ ok: false as const, err })
    ),
    followerCount(address),
    getTraderMeta(address),
  ]);

  // Pnl mevcut değilse kart yerine hata göster
  const pnlContent = pnlResult.ok ? (
    <PnlCard pnl={pnlResult.pnl} />
  ) : (
    <div className="card-surface">
      <p style={{ margin: 0 }}>
        Bu cüzdan için PnL şu an hesaplanamadı. Daha sonra tekrar dene.
      </p>
    </div>
  );

  // İtibar skoru ve rozet (PnL mevcutsa)
  const score = pnlResult.ok ? getReputationScore(pnlResult.pnl) : null;
  const badge = pnlResult.ok ? getBadge(pnlResult.pnl) : null;

  return (
    <main className="container">
      {/* Başlık */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>
          {badge ? `${badge.emoji} ` : ""}Trader Profili
        </h1>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
          {truncateAddress(address)}
        </p>
      </div>

      {/* PnL Kartı */}
      {pnlContent}

      {/* İtibar + Takipçi İstatistikleri */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 16,
        }}
      >
        {score !== null && (
          <StatBox label="İtibar Skoru" value={`${score}/100`} />
        )}
        <StatBox label="Takipçi" value={String(fCount)} />
      </div>

      {/* Takip Butonu */}
      <div style={{ marginTop: 16 }}>
        <FollowButton trader={address} initialFollowerCount={fCount} />
      </div>

      {/* Kirala Beni — ücretli alpha bölümü */}
      <div
        className="card-surface"
        style={{
          marginTop: 24,
          borderColor: "var(--accent-2)",
          background:
            "linear-gradient(135deg, rgba(139,92,246,0.08), var(--bg-elev) 60%)",
        }}
      >
        {/* Başlık */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            🔒 Kirala Beni — Ücretli Alpha
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent-2)",
              border: "1px solid var(--accent-2)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            YAKINDA
          </span>
        </div>

        {/* Fiyat */}
        <div style={{ marginTop: 14 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Aylık alpha erişim ücreti
          </span>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {meta.rentPriceUsd !== undefined
              ? `${formatUsd(meta.rentPriceUsd)}/ay`
              : "Fiyat belirlenmemiş"}
          </div>
        </div>

        {/* Bio */}
        {meta.bio && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text)",
            }}
          >
            {meta.bio}
          </p>
        )}

        {/* Abone ol butonu — stub (yakında) */}
        <button
          className="btn"
          disabled
          style={{ marginTop: 18 }}
          title="Ödeme entegrasyonu yakında eklenecek"
        >
          Abone ol — yakında
        </button>

        <p className="muted" style={{ marginTop: 10, fontSize: 12, margin: "10px 0 0" }}>
          Gerçek işlem bağlantısı henüz aktif değil. Bu özellik Faz 2'de Base
          Pay / USDC akış ödemesiyle devreye girecek.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Küçük stat kutusu
// ---------------------------------------------------------------------------

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
