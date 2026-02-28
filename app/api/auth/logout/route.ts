// API: Logout — limpa o cookie de sessão

import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(TOKEN_COOKIE);
  return response;
}
