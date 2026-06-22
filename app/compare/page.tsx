import { CompareView } from "@/components/CompareView";

/**
 * /compare — "Kim daha iyi trader?" karşılaştırma sayfası.
 * Next 15'te searchParams bir Promise; await ile okunur.
 * CompareView client bileşeni olduğu için bu sayfa server component kalabilir.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  // Next 15 App Router: searchParams Promise olarak gelir.
  const { a, b } = await searchParams;

  return (
    <main className="container">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>⚔️ Kim daha iyi trader?</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          İki cüzdan adresini gir, Base&apos;teki gerçek onchain itibar skorlarına
          göre kazananı bul.
        </p>
      </header>

      {/* CompareView, URL'den gelen a= ve b= değerleriyle prefill edilir. */}
      <CompareView initialA={a ?? ""} initialB={b ?? ""} />
    </main>
  );
}
