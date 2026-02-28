"use client";

import { useState, useEffect } from "react";

export function useBtcPrice() {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((d) => setPrice(typeof d.price === "number" ? d.price : null))
      .catch(() => {});
  }, []);

  return price;
}

/** Converte sats para string em EUR, ex: "≈ €12.34" */
export function satsToEur(sats: number | bigint, priceBtc: number | null): string {
  if (!priceBtc) return "";
  const satNum = typeof sats === "bigint" ? Number(sats) : sats;
  const eur = (satNum / 100_000_000) * priceBtc;
  if (eur < 0.01) return `≈ €${(eur * 100).toFixed(3)} ct`;
  if (eur < 100) return `≈ €${eur.toFixed(2)}`;
  return `≈ €${Math.round(eur).toLocaleString("pt-PT")}`;
}
