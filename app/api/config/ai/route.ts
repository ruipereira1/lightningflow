// API: Configuração das chaves de IA (Gemini + Groq)
// GET  /api/config/ai — retorna se as keys estão configuradas (sem expor o valor)
// POST /api/config/ai — guarda as keys

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: "singleton" },
      select: { geminiApiKey: true, groqApiKey: true },
    });
    return NextResponse.json({
      hasGemini: !!config?.geminiApiKey,
      hasGroq: !!config?.groqApiKey,
      geminiKeyHint: config?.geminiApiKey ? `...${config.geminiApiKey.slice(-6)}` : null,
      groqKeyHint: config?.groqApiKey ? `...${config.groqApiKey.slice(-6)}` : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { geminiApiKey?: string; groqApiKey?: string } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, string | null> = {};
  if (body.geminiApiKey !== undefined) data.geminiApiKey = body.geminiApiKey.trim() || null;
  if (body.groqApiKey !== undefined) data.groqApiKey = body.groqApiKey.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo fornecido" }, { status: 400 });
  }

  try {
    await prisma.appConfig.update({ where: { id: "singleton" }, data });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
