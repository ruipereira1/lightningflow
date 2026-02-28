// API: Saldo da wallet on-chain
// GET /api/wallet?nodeId=xxx

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) {
    return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });
  }

  try {
    const adapter = createAdapter(node);
    const balance = await adapter.getWalletBalance();

    return NextResponse.json({
      confirmedSat: balance.confirmedSat.toString(),
      unconfirmedSat: balance.unconfirmedSat.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
