import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);
  const peers = await adapter.listPeers();
  return NextResponse.json(peers);
}

export async function POST(request: NextRequest) {
  let body: { nodeId?: string; pubkey?: string; host?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const { nodeId, pubkey, host } = body;

  if (!nodeId || !pubkey || !host) {
    return NextResponse.json({ error: "nodeId, pubkey e host obrigatórios" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  const adapter = createAdapter(node);
  await adapter.connectPeer(pubkey, host);
  return NextResponse.json({ success: true });
}
