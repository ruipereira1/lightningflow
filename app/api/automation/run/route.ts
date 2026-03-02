// API: Trigger manual do scheduler
// POST /api/automation/run — executa automação imediatamente
// GET  /api/automation/run — retorna status atual do scheduler

import { NextResponse } from "next/server";
import { scheduler } from "@/lib/scheduler";

export async function GET() {
  const status = scheduler.getStatus();
  return NextResponse.json(status);
}

export async function POST() {
  try {
    const result = await scheduler.runNow();
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao executar automação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
