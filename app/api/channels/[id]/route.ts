import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

// Detalhe de canal — junta dados DB + analytics
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel || channel.nodeId !== nodeId) {
    return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
  }

  // Últimas 15 alterações de fee
  const feeHistory = await prisma.feeHistory.findMany({
    where: { nodeId, channelId: id },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, oldFeeRate: true, newFeeRate: true, reason: true, createdAt: true },
  });

  // Earnings dos últimos 30 dias (chanIdOut = este canal a encaminhar)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const earnings = await prisma.forwardingEvent.aggregate({
    where: { nodeId, chanIdOut: id, timestamp: { gte: thirtyDaysAgo } },
    _sum: { fee: true },
    _count: { id: true },
  });

  const localRatio = channel.capacity > 0n
    ? Number(channel.localBalance) / Number(channel.capacity)
    : 0.5;

  return NextResponse.json({
    id: channel.id,
    nodeId: channel.nodeId,
    remotePubkey: channel.remotePubkey,
    remoteAlias: channel.remoteAlias,
    capacity: channel.capacity.toString(),
    localBalance: channel.localBalance.toString(),
    remoteBalance: channel.remoteBalance.toString(),
    active: channel.active,
    localFeeRate: channel.localFeeRate,
    baseFee: channel.baseFee,
    remoteFeeRate: channel.remoteFeeRate,
    localRatio,
    updatedAt: channel.updatedAt,
    feeHistory,
    earnings30d: {
      feeSat: Number(earnings._sum.fee ?? 0n) / 1000,
      forwards: earnings._count.id,
    },
  });
}

// Fechar canal
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  try {
    const adapter = createAdapter(node);
    await adapter.closeChannel(id, force);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
