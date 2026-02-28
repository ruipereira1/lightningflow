// API: Abrir canal Lightning
// POST /api/channels/open
// Body: { nodeId, pubkey, host?, amountSat, feeRate? }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";
import { TOP_LIGHTNING_PEERS } from "@/lib/top-peers";

export async function POST(request: NextRequest) {
  try {
    const { nodeId, pubkey, host, amountSat, feeRate } = await request.json();

    if (!nodeId || !pubkey || !amountSat) {
      return NextResponse.json(
        { error: "nodeId, pubkey e amountSat são obrigatórios" },
        { status: 400 }
      );
    }

    if (amountSat < 20_000) {
      return NextResponse.json(
        { error: "Mínimo de 20.000 sat para abrir um canal" },
        { status: 400 }
      );
    }

    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: "Nó não encontrado" }, { status: 404 });
    }

    const adapter = createAdapter(node);

    // Verificar se o peer já está conectado
    const peers = await adapter.listPeers();
    const isConnected = peers.some((p) => p.pubkey === pubkey);

    if (!isConnected) {
      // Tentar conectar ao peer
      // Primeiro procurar no endereço fornecido, depois nos top peers
      const peerAddr = host ?? TOP_LIGHTNING_PEERS.find((p) => p.pubkey === pubkey)?.addr;

      if (!peerAddr) {
        return NextResponse.json(
          { error: "Endereço do peer não encontrado. Fornece pubkey@host manualmente." },
          { status: 400 }
        );
      }

      try {
        await adapter.connectPeer(pubkey, peerAddr);
      } catch (connectErr) {
        // Ignorar erro se já estava conectado (race condition)
        const msg = String(connectErr);
        if (!msg.includes("already") && !msg.includes("connected")) {
          return NextResponse.json(
            { error: `Falha ao conectar ao peer: ${msg}` },
            { status: 500 }
          );
        }
      }
    }

    // Abrir o canal
    const channelPoint = await adapter.openChannel(
      pubkey,
      amountSat,
      feeRate ?? 2
    );

    return NextResponse.json({
      channelPoint,
      message: `Canal aberto com sucesso. Channel point: ${channelPoint}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
