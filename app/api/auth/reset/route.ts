// API: Reset de senha de emergência
// POST /api/auth/reset
// Body: { resetSecret: "xxx", newPassword: "yyy" }
//
// Requer a variável de ambiente RESET_SECRET definida no .env
// Se RESET_SECRET não estiver definida, este endpoint está desativado por segurança.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  // Verificar se o reset está habilitado
  const resetSecret = process.env.RESET_SECRET;
  if (!resetSecret || resetSecret.length < 8) {
    return NextResponse.json(
      { error: "Reset não configurado. Define RESET_SECRET no .env (mínimo 8 caracteres)." },
      { status: 403 }
    );
  }

  let body: { resetSecret?: string; newPassword?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { resetSecret: provided, newPassword } = body;

  // Verificar o token de reset
  if (!provided || provided !== resetSecret) {
    return NextResponse.json({ error: "Token de reset inválido" }, { status: 401 });
  }

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "Nova senha deve ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (!config) {
    return NextResponse.json(
      { error: "App não configurada ainda" },
      { status: 404 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true, message: "Senha alterada com sucesso. Faz login com a nova senha." });
}
