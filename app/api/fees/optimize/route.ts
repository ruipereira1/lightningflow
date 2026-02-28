// API: Sugestões do fee optimizer
// GET /api/fees/optimize?nodeId=xxx — retorna sugestões de fees
// POST /api/fees/optimize — aplica todas as sugestões

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";
import { optimizeFees } from "@/lib/fee-optimizer";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);
  const channels = await adapter.listChannels();

  const suggestions = optimizeFees(channels);
  return NextResponse.json(suggestions);
}

export async function POST(request: NextRequest) {
  let body: { nodeId?: string; channelIds?: string[] } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { nodeId, channelIds } = body; // channelIds opcionais — se não definido, aplica a todos

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);
  const channels = await adapter.listChannels();
  const suggestions = optimizeFees(channels);

  // Filtrar se channelIds foi especificado
  const toApply = channelIds
    ? suggestions.filter((s) => channelIds.includes(s.channelId))
    : suggestions;

  const results = [];
  for (const suggestion of toApply) {
    try {
      await adapter.updateFees(suggestion.channelId, {
        feeRate: suggestion.suggestedFeeRate,
        baseFee: suggestion.suggestedBaseFee,
      });

      // Guardar histórico
      const dbChannel = await prisma.channel.findUnique({ where: { id: suggestion.channelId } });
      if (dbChannel) {
        await prisma.feeHistory.create({
          data: {
            nodeId,
            channelId: suggestion.channelId,
            oldFeeRate: suggestion.currentFeeRate,
            newFeeRate: suggestion.suggestedFeeRate,
            oldBaseFee: suggestion.currentBaseFee,
            newBaseFee: suggestion.suggestedBaseFee,
            reason: "optimizer",
          },
        });
        await prisma.channel.update({
          where: { id: suggestion.channelId },
          data: { localFeeRate: suggestion.suggestedFeeRate, baseFee: suggestion.suggestedBaseFee },
        });
      }

      results.push({ channelId: suggestion.channelId, success: true });
    } catch (err) {
      results.push({
        channelId: suggestion.channelId,
        success: false,
        error: err instanceof Error ? err.message : "Erro",
      });
    }
  }

  return NextResponse.json({ applied: results.length, results });
}
