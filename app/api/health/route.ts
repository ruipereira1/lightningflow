// GET /api/health — healthcheck para Docker e Umbrel
// Verifica que a app está a correr e a DB está acessível

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    // Verificar ligação à base de dados
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { status: "error", message: "Database unreachable" },
      { status: 503 }
    );
  }
}
