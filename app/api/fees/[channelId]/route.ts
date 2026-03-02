// API: Gestão de fees por canal
// GET /api/fees/[channelId]?nodeId=xxx — ver fees atuais
// PUT /api/fees/[channelId] — atualizar fees

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);
  const channel = await adapter.getChannel(channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  return NextResponse.json({
    channelId,
    feeRate: channel.localFeeRate,
    baseFee: channel.baseFee,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  let body: { nodeId?: string; feeRate?: number; baseFee?: number; reason?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { nodeId, feeRate, baseFee } = body;

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });
  if (feeRate === undefined || baseFee === undefined) {
    return NextResponse.json({ error: "feeRate e baseFee obrigatórios" }, { status: 400 });
  }

  // Bounds: previne fees absurdas (ex: sugestão IA maliciosa ou erro de input)
  // feeRate: 0–50000 ppm (0%–5%); baseFee: 0–10000000 msat (10 sat)
  if (!Number.isInteger(feeRate) || feeRate < 0 || feeRate > 50_000) {
    return NextResponse.json({ error: "feeRate inválido: deve estar entre 0 e 50000 ppm" }, { status: 400 });
  }
  if (!Number.isInteger(baseFee) || baseFee < 0 || baseFee > 10_000_000) {
    return NextResponse.json({ error: "baseFee inválido: deve estar entre 0 e 10000000 msat" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);

  // Buscar fees atuais para histórico
  const channel = await adapter.getChannel(channelId);
  const oldFeeRate = channel?.localFeeRate ?? 0;
  const oldBaseFee = channel?.baseFee ?? 1000;

  // Aplicar novas fees
  await adapter.updateFees(channelId, { feeRate, baseFee });

  // Guardar histórico
  const dbChannel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (dbChannel) {
    await prisma.feeHistory.create({
      data: {
        nodeId,
        channelId,
        oldFeeRate,
        newFeeRate: feeRate,
        oldBaseFee,
        newBaseFee: baseFee,
        reason: body.reason ?? "manual",
      },
    });

    // Atualizar canal na DB
    await prisma.channel.update({
      where: { id: channelId },
      data: { localFeeRate: feeRate, baseFee },
    });
  }

  return NextResponse.json({ success: true });
}
