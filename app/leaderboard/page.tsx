import type { Metadata } from "next";
import Link from "next/link";
import { getTop } from "@/lib/leaderboard";
import type { Snapshot } from "@/lib/leaderboard";
import { formatPct, formatUsd, truncateAddress, integrityDisplay } from "@/lib/format";
import { APP_NAME } from "@/lib/config";
import type { IntegritySignal } from "@/lib/data/types";

export const metadata: Metadata = {
  title: `Liderboard — ${APP_NAME}`,
  description: "En iyi kanıtlanmış onchain trader'lar",
};

// Sunucu bileşeni: her istekte taze veri çekiyor
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ metric?: string }>;
};

/** Integrity label'ı IntegritySignal'a dönüştürerek integrityDisplay'i çağırır. */
function getIntegrity(label: Snapshot["integrityLabel"]) {
  const signal: IntegritySignal = {
    label,
    churnRatioPct: 0,
    topPairConcentrationPct: 0,
    suspicious: label === "flagged",
  };
  return integrityDisplay(signal);
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const { metric: metricParam } = await searchParams;
  const metric: "roi" | "score" =
    metricParam === "roi" ? "roi" : "score";

  const snapshots = await getTop(metric, 50);

  return (
    <main className="container">
      {/* Başlık */}
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>🏆 Liderboard</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Base&apos;teki en iyi kanıtlanmış onchain trader&apos;lar.
        </p>
      </header>

      {/* Metrik geçiş linkleri */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <Link
          href="/leaderboard?metric=score"
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textAlign: "center",
            fontWeight: 600,
            fontSize: 14,
            background:
              metric === "score"
                ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                : "var(--bg-elev)",
            color: metric === "score" ? "white" : "var(--text)",
          }}
        >
          İtibar Puanı
        </Link>
        <Link
          href="/leaderboard?metric=roi"
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textAlign: "center",
            fontWeight: 600,
            fontSize: 14,
            background:
              metric === "roi"
                ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                : "var(--bg-elev)",
            color: metric === "roi" ? "white" : "var(--text)",
          }}
        >
          ROI
        </Link>
      </div>

      {/* Boş durum */}
      {snapshots.length === 0 && (
        <div className="card-surface" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏜️</div>
          <p style={{ marginBottom: 16 }}>
            Liderboard henüz boş. İlk sırayı sen al!
          </p>
          <Link href="/" className="btn" style={{ maxWidth: 240, margin: "0 auto" }}>
            Pasaportumu Çıkar
          </Link>
        </div>
      )}

      {/* Liderboard listesi */}
      {snapshots.length > 0 && (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {snapshots.map((snap, idx) => {
            const rank = idx + 1;
            const roiPositive = snap.roiPct >= 0;
            const integ = getIntegrity(snap.integrityLabel);

            // İlk 3 sıra için altın/gümüş/bronz simge
            const rankIcon =
              rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

            return (
              <li key={snap.address}>
                <Link
                  href={`/share/${snap.address}`}
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <div
                    className="card-surface"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    {/* Sıra */}
                    <div
                      style={{
                        minWidth: 36,
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: rankIcon ? 22 : 16,
                        color: rankIcon ? undefined : "var(--muted)",
                      }}
                    >
                      {rankIcon ?? `#${rank}`}
                    </div>

                    {/* Adres + rozet */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 15 }}>
                          {snap.badgeEmoji} {truncateAddress(snap.address)}
                        </span>
                        <span
                          className="muted"
                          style={{ fontSize: 12, textTransform: "capitalize" }}
                        >
                          {snap.badgeTier}
                        </span>
                      </div>

                      {/* İkinci satır: itibar + integrity chip */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <span className="muted" style={{ fontSize: 12 }}>
                          İtibar: {snap.reputation}/100
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          · {snap.tradeCount} işlem
                        </span>
                        {/* Integrity chip */}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: integ.color,
                            border: `1px solid ${integ.color}`,
                            borderRadius: 999,
                            padding: "1px 6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {integ.text}
                        </span>
                      </div>
                    </div>

                    {/* ROI + gerçekleşmiş PnL */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: roiPositive ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {formatPct(snap.roiPct)}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatUsd(snap.realizedPnlUsd)}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {/* Alt — kendinizi ekle */}
      {snapshots.length > 0 && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            Listede değil misin?
          </p>
          <Link href="/" className="btn btn-secondary" style={{ maxWidth: 260, margin: "0 auto" }}>
            Pasaportunu Çıkar &amp; Sıraya Gir
          </Link>
        </div>
      )}
    </main>
  );
}
