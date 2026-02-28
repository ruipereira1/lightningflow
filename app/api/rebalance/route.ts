// API: Rebalancing de canais
// GET /api/rebalance?nodeId=xxx — histórico de rebalances
// POST /api/rebalance — executar rebalance

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId obrigatório" }, { status: 400 });

  const jobs = await prisma.rebalanceJob.findMany({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(
    jobs.map((j) => ({
      ...j,
      amount: j.amount.toString(),
      feePaid: j.feePaid?.toString() ?? null,
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

  const { nodeId, fromChannel, toChannel, amountSat, maxFeePpm = 100 } = body as {
    nodeId?: string; fromChannel?: string; toChannel?: string;
    amountSat?: number; maxFeePpm?: number;
  };

  if (!nodeId || !fromChannel || !toChannel || !amountSat) {
    return NextResponse.json(
      { error: "nodeId, fromChannel, toChannel e amountSat são obrigatórios" },
      { status: 400 }
    );
  }

  if (typeof amountSat !== "number" || amountSat <= 0) {
    return NextResponse.json({ error: "amountSat deve ser um número positivo" }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });

  // Criar registo do job
  const job = await prisma.rebalanceJob.create({
    data: {
      nodeId,
      fromChannel,
      toChannel,
      amount: BigInt(Math.floor(amountSat)),
      status: "running",
    },
  });

  // Executar rebalance de forma assíncrona (fire-and-forget com catch)
  executeRebalance(node, job.id, fromChannel, toChannel, amountSat, Number(maxFeePpm)).catch((err) => {
    console.error("[Rebalance] Erro não apanhado no job", job.id, err);
  });

  return NextResponse.json({ jobId: job.id, status: "running" });
}

// Executa o rebalancing circular em background
async function executeRebalance(
  node: { id: string; type: string; host: string; macaroon?: string | null; cert?: string | null; rune?: string | null },
  jobId: string,
  fromChannel: string,
  toChannel: string,
  amountSat: number,
  maxFeePpm: number
) {
  const adapter = createAdapter(node);

  try {
    const maxFeeMsat = Math.floor(amountSat * maxFeePpm / 1000);

    // Criar invoice para receber de volta (rebalancing circular)
    const invoice = await adapter.createInvoice(amountSat, `Rebalance ${fromChannel} → ${toChannel}`);

    // Pagar a invoice através da rede
    const result = await adapter.sendPayment(invoice.paymentRequest, maxFeeMsat);

    // Calcular fee paga com segurança (totalFees pode ser undefined em CLN)
    const totalFeesMsat = result.route?.totalFees;
    const feePaid: bigint =
      totalFeesMsat != null ? BigInt(String(totalFeesMsat)) / 1000n : 0n;

    await prisma.rebalanceJob.update({
      where: { id: jobId },
      data: { status: "success", feePaid, completedAt: new Date() },
    });
  } catch (err) {
    await prisma.rebalanceJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Erro desconhecido",
        completedAt: new Date(),
      },
    });
  }
}
