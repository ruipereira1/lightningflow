// API SSE — Server-Sent Events para atualizações em tempo real
// GET /api/events?nodeId=xxx — stream de eventos do nó

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return new Response("nodeId obrigatório", { status: 400 });

  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return new Response("Nó não encontrado", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Enviar evento inicial
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent("connected", { nodeId, timestamp: new Date().toISOString() });

      // Subscrever eventos do nó
      const adapter = createAdapter(node);
      const unsubscribe = adapter.subscribeChannelEvents((event) => {
        sendEvent("channel", event);
      });

      // Polling de métricas básicas a cada 30s
      const pollInterval = setInterval(async () => {
        try {
          const info = await adapter.getInfo();
          sendEvent("nodeInfo", {
            numActiveChannels: info.numActiveChannels,
            blockHeight: info.blockHeight,
            timestamp: new Date().toISOString(),
          });
        } catch {
          // Ignorar erros de polling
        }
      }, 30000);

      // Limpeza quando cliente desconecta
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
