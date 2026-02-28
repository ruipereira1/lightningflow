// API: Login com senha
// POST /api/auth/login — recebe { password }, verifica e cria sessão JWT
//
// Proteção anti-brute-force:
//  - Máximo 5 tentativas falhadas por IP em 15 minutos
//  - Depois de 5 falhas: bloqueio de 15 minutos
//  - Tentativas bem-sucedidas limpam o contador

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createToken, TOKEN_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

// ── Rate limiter em memória (por IP) ─────────────────────────────────────────
// Reseta ao reiniciar o servidor. Para persistência usar Redis ou DB.

interface Attempt {
  count: number;
  firstAt: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, Attempt>();

const MAX_ATTEMPTS = 5;          // tentativas antes de bloquear
const WINDOW_MS    = 15 * 60_000; // janela de 15 min
const LOCKOUT_MS   = 15 * 60_000; // bloqueio de 15 min

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  let entry = attempts.get(ip);

  // Limpar entradas expiradas
  if (entry && entry.lockedUntil && now > entry.lockedUntil) {
    attempts.delete(ip);
    entry = undefined;
  }
  if (entry && !entry.lockedUntil && now - entry.firstAt > WINDOW_MS) {
    attempts.delete(ip);
    entry = undefined;
  }

  if (!entry) {
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterSec: 0 };
  }

  // IP bloqueado?
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  const remaining = MAX_ATTEMPTS - entry.count - 1;
  return { allowed: true, remaining, retryAfterSec: 0 };
}

function recordFailure(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip) ?? { count: 0, firstAt: now, lockedUntil: null };
  entry.count += 1;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }

  attempts.set(ip, entry);
}

function recordSuccess(ip: string) {
  attempts.delete(ip);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ip = getIp(request);
    const { allowed, remaining, retryAfterSec } = checkRateLimit(ip);

    if (!allowed) {
      const mins = Math.ceil(retryAfterSec / 60);
      return NextResponse.json(
        {
          error: `Demasiadas tentativas falhadas. Tenta novamente em ${mins} minuto${mins !== 1 ? "s" : ""}.`,
          retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    let body: { password?: string } = {};
    try { body = await request.json(); } catch { /* body vazio */ }
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Senha obrigatória" }, { status: 400 });
    }

    // Buscar configuração da app (onde está guardado o hash da senha)
    const config = await prisma.appConfig.findUnique({
      where: { id: "singleton" },
    });

    if (!config) {
      return NextResponse.json(
        { error: "App não configurada. Acede a /api/setup primeiro." },
        { status: 404 }
      );
    }

    // Verificar senha com bcrypt
    const isValid = await bcrypt.compare(password, config.passwordHash);

    if (!isValid) {
      recordFailure(ip);
      const { remaining: rem } = checkRateLimit(ip);
      const msg = rem > 0
        ? `Senha incorreta. ${rem} tentativa${rem !== 1 ? "s" : ""} restante${rem !== 1 ? "s" : ""}.`
        : `Senha incorreta. Conta bloqueada por 15 minutos.`;
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    // Login bem-sucedido — limpar contador
    recordSuccess(ip);

    // Criar token JWT com 7 dias de validade
    const token = await createToken({ authenticated: true });

    const response = NextResponse.json({ success: true });
    response.cookies.set(TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Erro no login:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
