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
  const result = await scheduler.runNow();
  return NextResponse.json({ success: true, result });
}
