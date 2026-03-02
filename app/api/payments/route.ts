// API: Payments (Pagamentos Lightning)
// GET  /api/payments?nodeId=X&limit=50 — lista pagamentos enviados
// POST /api/payments                   — paga uma invoice BOLT11

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const payments = await prisma.payment.findMany({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });

  return NextResponse.json(
    payments.map((p) => ({
      ...p,
      amountSat: p.amountSat.toString(),
      feeSat: p.feeSat.toString(),
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

  const { nodeId, paymentRequest, maxFeePpm = 500 } = body as {
    nodeId?: string;
    paymentRequest?: string;
    maxFeePpm?: number;
  };

  if (!nodeId || !paymentRequest) {
    return NextResponse.json(
      { error: "nodeId e paymentRequest são obrigatórios" },
      { status: 400 }
    );
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  // amount será obtido do resultado real — usar 1000 sats como estimativa para o maxFee
  const maxFeeMsat = Math.floor(1000 * Number(maxFeePpm));

  try {
    const adapter = createAdapter(node);
    const result = await adapter.sendPayment(paymentRequest, maxFeeMsat);

    const feeSat =
      result.route?.totalFees != null
        ? Number(result.route.totalFees) / 1000
        : 0;
    const amountSat =
      result.route?.totalAmt != null
        ? Number(result.route.totalAmt) / 1000 - feeSat
        : 0;

    const payment = await prisma.payment.create({
      data: {
        nodeId,
        paymentRequest,
        amountSat: BigInt(Math.round(Math.max(amountSat, 0))),
        feeSat: BigInt(Math.round(feeSat)),
        preimage: result.preimage ?? null,
        status: "success",
      },
    });

    return NextResponse.json({
      id: payment.id,
      status: "success",
      feeSat: payment.feeSat.toString(),
      preimage: payment.preimage,
    });
  } catch (err) {
    let errMsg = "Erro ao pagar invoice";
    if (err instanceof Error) errMsg = err.message;
    else if (Array.isArray(err)) errMsg = `[${err[0]}] ${err[1] ?? "sem detalhe"}`;

    await prisma.payment.create({
      data: {
        nodeId,
        paymentRequest,
        amountSat: 0n,
        feeSat: 0n,
        status: "failed",
        error: errMsg,
      },
    });

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
