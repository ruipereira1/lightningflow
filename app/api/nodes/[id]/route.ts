import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter, clearAdapterCache } from "@/lib/lightning";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await prisma.node.findUnique({
    where: { id },
    select: { id: true, name: true, type: true, host: true, active: true, createdAt: true },
  });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });
  return NextResponse.json(node);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  clearAdapterCache(id);
  try {
    await prisma.node.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // Prisma P2025 = record not found
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao remover nó" }, { status: 500 });
  }
}
