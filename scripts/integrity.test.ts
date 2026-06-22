/**
 * computeIntegrity sentetik veri testi. Node 24 yerel TS ile çalışır:
 *   node scripts/integrity.test.ts
 */
import { computeIntegrity } from "../lib/pnl/integrity.ts";
import type { RawTrade } from "../lib/data/types.ts";

const MIN = 60_000;
let t = Date.UTC(2026, 0, 1);

function trade(sold: string, bought: string, gapMin = 5): RawTrade {
  t += gapMin * MIN;
  return {
    hash: "0x" + Math.random().toString(16).slice(2),
    minedAt: t,
    status: "confirmed",
    isTrash: false,
    hasVerifiedAsset: true,
    valueUsd: 100,
    soldSymbol: sold,
    boughtSymbol: bought,
  };
}

let pass = 0;
let fail = 0;
function expect(name: string, cond: boolean, detail: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} — ${detail}`);
  }
}

// 1) Temiz yönlü trader: USDC ile farklı tokenlar alır, geri satmaz.
const clean = ["AERO", "DEGEN", "BRETT", "TOSHI", "MORPHO", "WELL"].map((tok) =>
  trade("USDC", tok, 240)
);
const c = computeIntegrity(clean);
console.log("Senaryo 1 — temiz:", c);
expect("clean etiketi", c.label === "clean", JSON.stringify(c));
expect("churn düşük", c.churnRatioPct === 0, `churn=${c.churnRatioPct}`);

// 2) Wash/churn: aynı pari dakikalar içinde sürekli al-sat.
const wash: RawTrade[] = [];
for (let i = 0; i < 6; i++) {
  wash.push(trade("USDC", "PUMP", 3));
  wash.push(trade("PUMP", "USDC", 3));
}
const w = computeIntegrity(wash);
console.log("Senaryo 2 — wash/churn:", w);
expect("flagged etiketi", w.label === "flagged", JSON.stringify(w));
expect("churn yüksek", w.churnRatioPct >= 60, `churn=${w.churnRatioPct}`);

// 3) Yetersiz veri: 2 işlem → yargıda bulunma.
const few = [trade("USDC", "PUMP", 3), trade("PUMP", "USDC", 3)];
const f = computeIntegrity(few);
console.log("Senaryo 3 — az işlem:", f);
expect("clean (yetersiz veri)", f.label === "clean", JSON.stringify(f));

// 4) Boş.
const e = computeIntegrity([]);
expect("boş → clean", e.label === "clean" && e.churnRatioPct === 0, JSON.stringify(e));

console.log(`\n${pass} geçti, ${fail} kaldı`);
if (fail > 0) process.exit(1);
