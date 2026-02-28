// Fee Optimizer — Algoritmo para sugerir e ajustar fees automaticamente
// Baseado no ratio de liquidez local/remoto de cada canal

export interface ChannelFeeRecommendation {
  channelId: string;
  remotePubkey: string;
  remoteAlias?: string;
  currentFeeRate: number;   // ppm atual
  suggestedFeeRate: number; // ppm sugerido
  currentBaseFee: number;   // msat atual
  suggestedBaseFee: number; // msat sugerido
  localRatio: number;       // 0-1
  reason: string;           // explicação da sugestão
  urgency: "low" | "medium" | "high"; // urgência de agir
}

export interface OptimizerConfig {
  minFeePpm: number;   // fee mínima a definir (default: 1)
  maxFeePpm: number;   // fee máxima a definir (default: 2000)
  targetRatio: number; // ratio alvo de liquidez local (default: 0.5 = 50%)
  aggressiveness: number; // 0-1, quão agressivo é o ajuste (default: 0.5)
}

const DEFAULT_CONFIG: OptimizerConfig = {
  minFeePpm: 1,
  maxFeePpm: 2000,
  targetRatio: 0.5,
  aggressiveness: 0.5,
};

export interface ChannelData {
  id: string;
  remotePubkey: string;
  remoteAlias?: string;
  localBalance: bigint;
  remoteBalance: bigint;
  capacity: bigint;
  localFeeRate: number;
  baseFee: number;
  remoteFeeRate?: number | null;
}

/**
 * Calcula sugestões de fees para todos os canais
 * 
 * Lógica:
 * - Se localRatio > targetRatio + threshold → demasiado local → subir fee (canal com outbound escasso)
 * - Se localRatio < targetRatio - threshold → demasiado remoto → baixar fee (atrair pagamentos)
 * - Perto do target → manter fee atual
 */
export function optimizeFees(
  channels: ChannelData[],
  config: Partial<OptimizerConfig> = {}
): ChannelFeeRecommendation[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const threshold = 0.15; // variação de 15% do target antes de agir

  return channels.map((channel) => {
    const total = Number(channel.capacity);
    if (total === 0) {
      return {
        channelId: channel.id,
        remotePubkey: channel.remotePubkey,
        remoteAlias: channel.remoteAlias,
        currentFeeRate: channel.localFeeRate,
        suggestedFeeRate: channel.localFeeRate,
        currentBaseFee: channel.baseFee,
        suggestedBaseFee: channel.baseFee,
        localRatio: 0.5,
        reason: "Canal sem capacidade",
        urgency: "low" as const,
      };
    }

    const localRatio = Number(channel.localBalance) / total;
    const deviation = localRatio - cfg.targetRatio;

    let suggestedFeeRate = channel.localFeeRate;
    let reason = "";
    let urgency: "low" | "medium" | "high" = "low";

    if (deviation > threshold) {
      // Demasiada liquidez local — subir fee para desencorajar outbound e ganhar mais por routing
      const adjustFactor = 1 + (deviation - threshold) * 2 * cfg.aggressiveness;
      suggestedFeeRate = Math.min(
        Math.round(channel.localFeeRate * adjustFactor),
        cfg.maxFeePpm
      );
      // Garantir que a fee sobe pelo menos 10 ppm quando há desvio significativo
      if (suggestedFeeRate === channel.localFeeRate) {
        suggestedFeeRate = Math.min(channel.localFeeRate + 10, cfg.maxFeePpm);
      }
      // Se o peer cobra mais do que a nossa sugestão, subir até 90% da fee do peer
      if (channel.remoteFeeRate != null && channel.remoteFeeRate > suggestedFeeRate) {
        suggestedFeeRate = Math.min(Math.round(channel.remoteFeeRate * 0.9), cfg.maxFeePpm);
        reason = `Canal com ${Math.round(localRatio * 100)}% local — subir fee; peer cobra ${channel.remoteFeeRate} ppm`;
      } else {
        reason = `Canal com ${Math.round(localRatio * 100)}% local — subir fee para valorizar liquidez outbound`;
      }
      urgency = deviation > threshold * 2 ? "high" : "medium";
    } else if (deviation < -threshold) {
      // Demasiada liquidez remota — baixar fee para atrair pagamentos e recarregar local
      const adjustFactor = 1 - (Math.abs(deviation) - threshold) * 2 * cfg.aggressiveness;
      suggestedFeeRate = Math.max(
        Math.round(channel.localFeeRate * adjustFactor),
        cfg.minFeePpm
      );
      // Garantir que a fee desce pelo menos 10 ppm quando há desvio significativo
      if (suggestedFeeRate === channel.localFeeRate) {
        suggestedFeeRate = Math.max(channel.localFeeRate - 10, cfg.minFeePpm);
      }
      // Se o peer cobra menos do que a nossa sugestão, aproximar da fee do peer
      if (channel.remoteFeeRate != null && channel.remoteFeeRate < suggestedFeeRate) {
        suggestedFeeRate = Math.max(channel.remoteFeeRate + 5, cfg.minFeePpm);
        reason = `Canal com ${Math.round(localRatio * 100)}% local — baixar fee; peer cobra ${channel.remoteFeeRate} ppm`;
      } else {
        reason = `Canal com ${Math.round(localRatio * 100)}% local — baixar fee para atrair pagamentos`;
      }
      urgency = Math.abs(deviation) > threshold * 2 ? "high" : "medium";
    } else {
      if (channel.remoteFeeRate != null) {
        reason = `Canal equilibrado (${Math.round(localRatio * 100)}% local) — fee adequada; peer cobra ${channel.remoteFeeRate} ppm`;
      } else {
        reason = `Canal equilibrado (${Math.round(localRatio * 100)}% local) — fee atual adequada`;
      }
      urgency = "low";
    }

    return {
      channelId: channel.id,
      remotePubkey: channel.remotePubkey,
      remoteAlias: channel.remoteAlias,
      currentFeeRate: channel.localFeeRate,
      suggestedFeeRate,
      currentBaseFee: channel.baseFee,
      suggestedBaseFee: channel.baseFee, // base fee não muda por enquanto
      localRatio,
      reason,
      urgency,
    };
  }).filter((r) => r.suggestedFeeRate !== r.currentFeeRate || r.urgency !== "low");
}

/**
 * Verifica quais canais precisam de rebalancing
 * Retorna lista ordenada por urgência
 */
export function findRebalanceCandidates(
  channels: ChannelData[],
  targetRatio = 0.5,
  threshold = 0.2
) {
  return channels
    .map((c) => {
      const total = Number(c.capacity);
      if (total === 0) return null;
      const localRatio = Number(c.localBalance) / total;
      const deviation = Math.abs(localRatio - targetRatio);
      return { channel: c, localRatio, deviation };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && item.deviation > threshold)
    .sort((a, b) => b.deviation - a.deviation);
}
