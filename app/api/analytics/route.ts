// API: Analytics de rentabilidade
// GET /api/analytics?nodeId=xxx&days=30 — earnings e métricas

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30");
  const sync = request.nextUrl.searchParams.get("sync") === "true";

  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  // Sincronizar forwarding history do nó se pedido
  if (sync) {
    try {
      const adapter = createAdapter(node);
      const appConfig = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
      // Usar cursor persistente; na primeira vez, sincronizar últimas 25h
      const syncSince = appConfig?.lastForwardSync ?? new Date(Date.now() - 25 * 60 * 60 * 1000);
      const events = await adapter.getForwardingHistory(syncSince, 5000);

      for (const event of events) {
        const evId = `${nodeId}-${event.timestamp.getTime()}-${event.chanIdIn}-${event.chanIdOut}`;
        await prisma.forwardingEvent.upsert({
          where: { id: evId },
          create: {
            id: evId,
            nodeId,
            timestamp: event.timestamp,
            chanIdIn: event.chanIdIn,
            chanIdOut: event.chanIdOut,
            amtIn: event.amtIn,
            amtOut: event.amtOut,
            fee: event.fee,
          },
          update: {},
        });
      }

      // Actualizar cursor para evitar re-sincronizar eventos já processados
      if (appConfig) {
        await prisma.appConfig.update({
          where: { id: "singleton" },
          data: { lastForwardSync: new Date() },
        });
      }
    } catch (err) {
      console.error("Erro ao sincronizar forwarding history:", err);
    }
  }

  // Buscar eventos da DB
  const events = await prisma.forwardingEvent.findMany({
    where: { nodeId, timestamp: { gte: sinceDate } },
    orderBy: { timestamp: "asc" },
  });

  // Agregar por dia
  const byDay = new Map<string, { date: string; fees: bigint; count: number }>();
  for (const event of events) {
    const day = event.timestamp.toISOString().split("T")[0];
    const existing = byDay.get(day) ?? { date: day, fees: 0n, count: 0 };
    byDay.set(day, {
      date: day,
      fees: existing.fees + event.fee,
      count: existing.count + 1,
    });
  }

  // Agregar por canal (top canais por earnings)
  const byChannel = new Map<string, { chanId: string; earned: bigint; count: number }>();
  for (const event of events) {
    const chanOut = event.chanIdOut;
    const existing = byChannel.get(chanOut) ?? { chanId: chanOut, earned: 0n, count: 0 };
    byChannel.set(chanOut, {
      chanId: chanOut,
      earned: existing.earned + event.fee,
      count: existing.count + 1,
    });
  }

  // Buscar canais da DB para ROI
  const dbChannels = await prisma.channel.findMany({
    where: { nodeId },
    select: { id: true, capacity: true, active: true, localFeeRate: true },
  });
  const capacityMap = new Map(dbChannels.map((c) => [c.id, c]));

  // ROI anualizado por canal: (earned / capacity) * (365/days) * 100
  const channelRoi = Array.from(byChannel.values()).map((c) => {
    const ch = capacityMap.get(c.chanId);
    const capacitySat = ch ? Number(ch.capacity) : 0;
    const earnedSat = Number(c.earned) / 1000;
    const roiPercent = capacitySat > 0
      ? (earnedSat / capacitySat) * (365 / days) * 100
      : 0;
    return {
      chanId: c.chanId,
      earnedSat,
      capacitySat,
      roiPercent: Math.round(roiPercent * 100) / 100,
      forwards: c.count,
    };
  }).sort((a, b) => b.roiPercent - a.roiPercent);

  // Canais mortos: ativos mas 0 forwards no período
  const channelsWithForwards = new Set(byChannel.keys());
  const deadChannels = dbChannels
    .filter((c) => c.active && !channelsWithForwards.has(c.id))
    .map((c) => ({ chanId: c.id, capacitySat: Number(c.capacity), feeRate: c.localFeeRate }));

  const totalFeesMsat = events.reduce((sum, e) => sum + e.fee, 0n);
  const totalForwards = events.length;

  return NextResponse.json({
    totalFeesSat: Number(totalFeesMsat) / 1000,
    totalForwards,
    avgFeePerForward: totalForwards > 0 ? Number(totalFeesMsat) / totalForwards / 1000 : 0,
    dailyEarnings: Array.from(byDay.values()).map((d) => ({
      date: d.date,
      feesSat: Number(d.fees) / 1000,
      count: d.count,
    })),
    topChannels: Array.from(byChannel.values())
      .sort((a, b) => Number(b.earned - a.earned))
      .slice(0, 10)
      .map((c) => ({
        chanId: c.chanId,
        earnedSat: Number(c.earned) / 1000,
        count: c.count,
      })),
    channelRoi,
    deadChannels,
  });
}
