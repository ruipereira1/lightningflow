// Autenticação da app: JWT simples para uso self-hosted
// Usa jose (compatível com Edge Runtime do Next.js)

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const TOKEN_COOKIE = "lf_session";
const TOKEN_EXPIRES = "7d"; // sessão dura 7 dias

// Obtém o segredo JWT da configuração ou de variável de ambiente
export async function getJwtSecret(): Promise<Uint8Array> {
  const secret = process.env.SESSION_SECRET ?? "changeme-use-env-var-in-production";
  return new TextEncoder().encode(secret);
}

// Cria um token JWT assinado
export async function createToken(payload: Record<string, unknown>): Promise<string> {
  const secret = await getJwtSecret();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRES)
    .sign(secret);
}

// Verifica e descodifica um token JWT
export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const secret = await getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null; // token inválido ou expirado
  }
}

// Lê o token do cookie da sessão
export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value;
}

// Verifica se o utilizador está autenticado
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload !== null;
}

export { TOKEN_COOKIE };
