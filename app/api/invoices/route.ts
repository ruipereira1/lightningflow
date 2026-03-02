// API: Invoices (Faturas Lightning)
// GET  /api/invoices?nodeId=X&limit=50 — lista faturas criadas
// POST /api/invoices                   — cria nova fatura

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const invoices = await prisma.invoice.findMany({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });

  return NextResponse.json(
    invoices.map((inv) => ({
      ...inv,
      amountSat: inv.amountSat.toString(),
    }))
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { nodeId, amountSat, memo } = body as {
    nodeId?: string;
    amountSat?: number;
    memo?: string;
  };

  if (!nodeId || !amountSat) {
    return NextResponse.json({ error: "nodeId e amountSat são obrigatórios" }, { status: 400 });
  }
  if (typeof amountSat !== "number" || amountSat <= 0) {
    return NextResponse.json({ error: "amountSat deve ser um número positivo" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  try {
    const adapter = createAdapter(node);
    const result = await adapter.createInvoice(amountSat, memo ?? "LightningFlow Invoice");

    const invoice = await prisma.invoice.create({
      data: {
        nodeId,
        rHash: result.rHash,
        paymentRequest: result.paymentRequest,
        amountSat: BigInt(Math.floor(amountSat)),
        memo: memo ?? null,
        status: "pending",
      },
    });

    return NextResponse.json({
      id: invoice.id,
      paymentRequest: invoice.paymentRequest,
      rHash: invoice.rHash,
      amountSat: invoice.amountSat.toString(),
      memo: invoice.memo,
    });
  } catch (err) {
    let errMsg = "Erro ao criar invoice";
    if (err instanceof Error) errMsg = err.message;
    else if (Array.isArray(err)) errMsg = `[${err[0]}] ${err[1] ?? "sem detalhe"}`;
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
