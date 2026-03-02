// API: Histórico de alterações de fees
// GET /api/fee-history?nodeId=xxx&limit=50

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  try {
    const history = await prisma.feeHistory.findMany({
      where: { nodeId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        channelId: true,
        oldFeeRate: true,
        newFeeRate: true,
        oldBaseFee: true,
        newBaseFee: true,
        reason: true,
        createdAt: true,
        channel: {
          select: { remoteAlias: true, remotePubkey: true },
        },
      },
    });

    return NextResponse.json(history.map((h) => ({
      ...h,
      remoteAlias: h.channel?.remoteAlias ?? null,
      remotePubkey: h.channel?.remotePubkey ?? null,
      channel: undefined,
    })));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao carregar histórico";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
