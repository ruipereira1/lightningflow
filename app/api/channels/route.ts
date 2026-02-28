// API: Lista canais de um nó
// GET /api/channels?nodeId=xxx — lista e sincroniza canais com a DB

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json({ error: "nodeId é obrigatório" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  try {
    const adapter = createAdapter(node);
    const channels = await adapter.listChannels();

    // Sincronizar canais com a base de dados (para analytics históricos)
    for (const ch of channels) {
      await prisma.channel.upsert({
        where: { id: ch.id },
        create: {
          id: ch.id,
          nodeId,
          remotePubkey: ch.remotePubkey,
          remoteAlias: ch.remoteAlias,
          capacity: ch.capacity,
          localBalance: ch.localBalance,
          remoteBalance: ch.remoteBalance,
          active: ch.active,
          localFeeRate: ch.localFeeRate,
          baseFee: ch.baseFee,
          remoteFeeRate: ch.remoteFeeRate,
        },
        update: {
          remoteAlias: ch.remoteAlias,
          localBalance: ch.localBalance,
          remoteBalance: ch.remoteBalance,
          active: ch.active,
          localFeeRate: ch.localFeeRate,
          baseFee: ch.baseFee,
          remoteFeeRate: ch.remoteFeeRate,
        },
      });
    }

    // Retornar com métricas calculadas
    return NextResponse.json(
      channels.map((ch) => ({
        ...ch,
        capacity: ch.capacity.toString(),
        localBalance: ch.localBalance.toString(),
        remoteBalance: ch.remoteBalance.toString(),
        localRatio: Number(ch.localBalance) / (Number(ch.localBalance) + Number(ch.remoteBalance) || 1),
      }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Erro ao buscar canais: ${err instanceof Error ? err.message : "desconhecido"}` },
      { status: 500 }
    );
  }
}
