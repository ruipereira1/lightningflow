// API: Gestão de nós Lightning
// GET /api/nodes — lista todos os nós
// POST /api/nodes — adiciona novo nó

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

// Listar todos os nós (sem expor credenciais)
export async function GET() {
  const nodes = await prisma.node.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      host: true,
      active: true,
      createdAt: true,
      // NUNCA enviar macaroon/cert/rune para o frontend
    },
  });
  return NextResponse.json(nodes);
}

// Adicionar novo nó
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, host, macaroon, cert, rune } = body;

    if (!name || !type || !host) {
      return NextResponse.json(
        { error: "name, type e host são obrigatórios" },
        { status: 400 }
      );
    }

    if (!["lnd", "cln"].includes(type)) {
      return NextResponse.json(
        { error: "type deve ser 'lnd' ou 'cln'" },
        { status: 400 }
      );
    }

    // Testar conexão antes de guardar
    const node = await prisma.node.create({
      data: { name, type, host, macaroon, cert, rune },
    });

    try {
      const adapter = createAdapter(node);
      await adapter.getInfo(); // teste de conexão
    } catch (err) {
      // Se falhar, apagar o nó criado
      await prisma.node.delete({ where: { id: node.id } });
      return NextResponse.json(
        { error: `Não foi possível ligar ao nó: ${err instanceof Error ? err.message : "erro desconhecido"}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: node.id, name: node.name, type: node.type, host: node.host });
  } catch (error) {
    console.error("Erro ao criar nó:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
