// Factory — cria o adapter certo baseado no tipo de nó

import { LNDAdapter } from "./lnd";
import { CLNAdapter } from "./cln";
import type { LightningAdapter, NodeConfig } from "./adapter";

// Cache de adapters para não recriar em cada chamada
const adapterCache = new Map<string, LightningAdapter>();

// Aceita tanto NodeConfig estrito como o objeto Prisma (onde type é string)
export function createAdapter(node: NodeConfig | { id: string; type: string; host: string; macaroon?: string | null; cert?: string | null; rune?: string | null }): LightningAdapter {
  const typedNode = node as NodeConfig;
  // Verificar cache
  const cached = adapterCache.get(typedNode.id);
  if (cached) return cached;

  const adapter = typedNode.type === "lnd"
    ? new LNDAdapter(typedNode)
    : new CLNAdapter(typedNode);

  adapterCache.set(typedNode.id, adapter);
  return adapter;
}

// Limpar cache quando configuração do nó muda
export function clearAdapterCache(nodeId?: string) {
  if (nodeId) {
    adapterCache.delete(nodeId);
  } else {
    adapterCache.clear();
  }
}

export type { LightningAdapter, NodeConfig };
export * from "./types";
