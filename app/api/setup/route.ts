// API: Setup inicial da app
// POST /api/setup — cria a senha de acesso (só pode ser feito uma vez)

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    // Verificar se já foi configurada
    const existing = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    if (existing) {
      return NextResponse.json({ error: "App já configurada" }, { status: 409 });
    }

    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Senha deve ter pelo menos 8 caracteres" },
        { status: 400 }
      );
    }

    // Hash da senha com bcrypt (custo 12 = seguro e razoavelmente rápido)
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Gerar segredo aleatório para JWT
    const sessionSecret = randomBytes(32).toString("hex");

    await prisma.appConfig.create({
      data: { passwordHash, sessionSecret },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro no setup:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Verificar se a app já foi configurada
export async function GET() {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ configured: !!config });
}
