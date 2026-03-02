// API: Configuração de Automação
// GET  /api/automation — lê configuração atual
// POST /api/automation — actualiza configuração

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const config = await prisma.appConfig.findUnique({
    where: { id: "singleton" },
    select: {
      autoFeeEnabled: true,
      autoRebalanceEnabled: true,
      autoPeerEnabled: true,
      automationInterval: true,
      lastAutomationRun: true,
    },
  });

  const rules = await prisma.autoRule.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    config: config ?? {
      autoFeeEnabled: false,
      autoRebalanceEnabled: false,
      autoPeerEnabled: false,
      automationInterval: 60,
      lastAutomationRun: null,
    },
    rules,
  });
}

export async function POST(request: NextRequest) {
  let body: { autoFeeEnabled?: boolean; autoRebalanceEnabled?: boolean; autoPeerEnabled?: boolean; automationInterval?: number } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { autoFeeEnabled, autoRebalanceEnabled, autoPeerEnabled, automationInterval } = body;

  if (automationInterval !== undefined) {
    const interval = Number(automationInterval);
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
      return NextResponse.json({ error: "automationInterval deve estar entre 1 e 1440 minutos" }, { status: 400 });
    }
  }

  const config = await prisma.appConfig.update({
    where: { id: "singleton" },
    data: {
      ...(autoFeeEnabled !== undefined && { autoFeeEnabled }),
      ...(autoRebalanceEnabled !== undefined && { autoRebalanceEnabled }),
      ...(autoPeerEnabled !== undefined && { autoPeerEnabled }),
      ...(automationInterval !== undefined && { automationInterval: Number(automationInterval) }),
    },
    select: {
      autoFeeEnabled: true,
      autoRebalanceEnabled: true,
      autoPeerEnabled: true,
      automationInterval: true,
      lastAutomationRun: true,
    },
  });

  return NextResponse.json({ success: true, config });
}
