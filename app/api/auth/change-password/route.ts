// API: Alterar senha (requer senha atual)
// POST /api/auth/change-password
// Body: { currentPassword, newPassword }

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  let body: { currentPassword?: string; newPassword?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Campos obrigatórios em falta" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Nova senha deve ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  if (!config) {
    return NextResponse.json({ error: "App não configurada" }, { status: 404 });
  }

  const isValid = await bcrypt.compare(currentPassword, config.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true, message: "Senha alterada com sucesso" });
}
