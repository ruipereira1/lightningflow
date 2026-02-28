// API: Preço BTC em tempo real (via CoinGecko, cache 5 minutos)
// GET /api/price → { price: number (EUR), usd: number, currency: "EUR" }

import { NextResponse } from "next/server";

let cache: { price: number; usd: number; currency: string; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache);
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur,usd",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

    const data = await res.json() as { bitcoin: { eur: number; usd: number } };
    cache = {
      price: data.bitcoin.eur,
      usd: data.bitcoin.usd,
      currency: "EUR",
      ts: Date.now(),
    };
    return NextResponse.json({ price: data.bitcoin.eur, usd: data.bitcoin.usd, currency: "EUR" });
  } catch {
    // Retornar cache expirado se disponível
    if (cache) return NextResponse.json({ ...cache, stale: true });
    return NextResponse.json({ price: null, usd: null, currency: "EUR" }, { status: 503 });
  }
}
