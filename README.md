# 🛡️ Onchain PnL Pasaportu

Cüzdanını bağla → Base'teki gerçek, manipüle edilemez PnL'in hesaplansın → Farcaster/Base App profiline **paylaşılabilir kart + rozet** olarak bas. _"Kanıtlanmış %340 ROI, son 90 gün."_

Tek kod tabanı, **hem Base App hem Farcaster** Mini App olarak çalışır (OnchainKit + MiniKit).

## Mimari

| Katman | Dosya | Görev |
|---|---|---|
| Sağlayıcı arayüzü | `lib/data/provider.ts` | Sağlayıcıdan bağımsız `PnLProvider` (hibrit stratejinin teknik karşılığı) |
| Veri (Faz 1) | `lib/data/zerion.ts` | Zerion PnL + trade endpoint'leri (FIFO realized/unrealized, Base filtresi) |
| Gürültü temizleme | `lib/pnl/normalize.ts` | Spam/airdrop/failed eleme, gerçek swap sayımı, proof hash |
| Skor & rozet | `lib/pnl/score.ts` | ROI→rozet seviyesi + 0–100 manipülasyona dirençli itibar skoru |
| PnL servisi | `lib/pnl/service.ts` | Sağlayıcı→normalize→cache; tek giriş noktası |
| API | `app/api/pnl/route.ts` | `GET /api/pnl?address=` |
| Kart (OG) | `app/api/card/route.tsx` | Dinamik PNG kart (`next/og`) |
| Paylaşım | `app/share/[address]/page.tsx` | `fc:miniapp`/`fc:frame` embed meta'ları |
| Manifest | `app/.well-known/farcaster.json/route.ts` | Sahiplik + keşif |

**Hibrit veri stratejisi:** Faz 1 Zerion API kullanır. Faz 2'de `lib/data/indexer.ts` (kendi Base RPC log-decode katmanın) aynı `PnLProvider` arayüzünü implemente edip `PNL_PROVIDER=indexer` ile devreye girer — uygulama kodu hiç değişmez. Moat budur.

## Kurulum

```bash
npm install
cp .env.example .env   # değerleri doldur
npm run dev
```

Gerekli env (`.env`):
- `ZERION_API_KEY` — https://developers.zerion.io (PnL hesabı için zorunlu)
- `NEXT_PUBLIC_ONCHAINKIT_API_KEY` — https://portal.cdp.coinbase.com
- `NEXT_PUBLIC_URL` — deploy domain'in (yerelde `http://localhost:3000`)
- `REDIS_URL` / `REDIS_TOKEN` — Upstash (opsiyonel; yoksa bellek-içi cache)

## Test (anahtar gerektirmeden)

```bash
npm run build && npm run start
curl http://localhost:3000/.well-known/farcaster.json     # geçerli JSON
curl -o card.png http://localhost:3000/api/card           # marka kartı PNG
```

`ZERION_API_KEY` girince: `curl "http://localhost:3000/api/pnl?address=0x...&window=90"`.

## Deploy & yayın

1. Vercel'e deploy et, env'leri ekle (`NEXT_PUBLIC_URL` = gerçek domain).
2. `npx create-onchain --manifest` ile `FARCASTER_HEADER/PAYLOAD/SIGNATURE` üret (domain'inle imzalanır), env'e ekle.
3. `public/icon.png` (1024×1024) ve `public/splash.png`'i kendi markanla değiştir (şu an düz renk yer-tutucu).
4. Base App / Farcaster Mini App önizleme aracıyla `/share/0x...` embed'ini doğrula.

## Yol haritası

- **Faz 1 ✅** Base spot DEX PnL (Zerion), kart, rozet, skor, cast akışı, manifest.
- **Faz 4 (moat derinleştirme):** wash-trading heuristikleri, döngüsel swap tespiti, kendi Base RPC indexer'ı (`PNL_PROVIDER=indexer`).
- **Ürün:** copy-trading, "kirala beni" (paid alpha), leaderboard.
