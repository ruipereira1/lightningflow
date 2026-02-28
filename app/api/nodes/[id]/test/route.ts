import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  try {
    const adapter = createAdapter(node);
    const info = await adapter.getInfo();
    return NextResponse.json({ success: true, info });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 400 }
    );
  }
}
