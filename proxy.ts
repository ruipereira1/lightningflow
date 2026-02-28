// Middleware de autenticação e segurança — protege todas as rotas
//
// Funcionalidades:
//  1. Rate limiting global por IP (100 req/min — protege contra DDoS)
//  2. Verificação JWT para rotas protegidas
//  3. Headers de segurança em todas as respostas

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/setup", "/api/auth/reset", "/api/health"];

// ── Rate Limiter Global ───────────────────────────────────────────────────────

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateMap = new Map<string, RateEntry>();
const RATE_LIMIT   = 100;         // max requests per window
const RATE_WINDOW  = 60_000;      // 1 minuto

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return true;
  }

  return false;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

// ── Security Headers ──────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Impede que a app seja carregada dentro de iframes (clickjacking)
  response.headers.set("X-Frame-Options", "DENY");
  // Impede que o browser faça sniffing do content-type (MIME confusion)
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Não enviar referrer para outros domínios
  response.headers.set("Referrer-Policy", "no-referrer");
  // Desativar funcionalidades de browser não necessárias
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // XSS protection (browsers antigos)
  response.headers.set("X-XSS-Protection", "1; mode=block");
  // HSTS — forçar HTTPS (só ativo em produção)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return response;
}

// ── Middleware Principal ──────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getIp(request);

  // 1. Rate limiting global (exceto assets estáticos)
  if (!pathname.startsWith("/_next/")) {
    if (isRateLimited(ip)) {
      const response = NextResponse.json(
        { error: "Demasiadas requisições. Tenta novamente em 1 minuto." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
      return addSecurityHeaders(response);
    }
  }

  // 2. Rotas públicas — não precisam de autenticação
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // 3. Verificar token de sessão
  const token = request.cookies.get("lf_session")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.SESSION_SECRET ?? "changeme-use-env-var-in-production"
    );
    await jwtVerify(token, secret);
    return addSecurityHeaders(NextResponse.next());
  } catch {
    // Token inválido — limpar cookie e redirecionar
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Sessão expirada" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    response.cookies.delete("lf_session");
    return addSecurityHeaders(response as NextResponse);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
