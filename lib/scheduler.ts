// Scheduler de Automação — corre em background sem intervenção do utilizador
//
// Responsável por:
// 1. Sincronizar histórico de forwards (sempre — popula analytics)
// 2. Ajustar fees automaticamente baseado na liquidez dos canais
// 3. Rebalancear canais quando necessário (só se for rentável — sem prejuízo)
// 4. Conectar automaticamente a peers de qualidade

import { prisma } from "@/lib/db/prisma";
import { createAdapter } from "@/lib/lightning";
import { optimizeFees, findRebalanceCandidates } from "@/lib/fee-optimizer";
import { TOP_LIGHTNING_PEERS } from "@/lib/top-peers";

export interface SchedulerResult {
  feesAdjusted: number;
  rebalancesStarted: number;
  peersConnected: number;
  forwardsSynced: number;
  errors: string[];
  timestamp: Date;
}

export interface SchedulerStatus {
  running: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  lastResult: SchedulerResult | null;
}

class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;
  private lastResult: SchedulerResult | null = null;

  // Inicia o scheduler — chamado uma vez no startup (instrumentation.ts)
  start() {
    if (this.timer) return;
    console.log("[Scheduler] A iniciar...");
    this.scheduleNext();
  }

  // Agenda o próximo run com base no intervalo configurado
  private async scheduleNext() {
    try {
      const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
      const intervalMs = ((config?.automationInterval ?? 60)) * 60 * 1000;

      this.timer = setTimeout(async () => {
        await this.runOnce();
        this.scheduleNext();
      }, intervalMs);

      this.nextRun = new Date(Date.now() + intervalMs);
    } catch {
      // Se DB não estiver pronta, tentar de novo em 2 minutos
      this.timer = setTimeout(() => this.scheduleNext(), 2 * 60 * 1000);
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.nextRun = null;
    }
  }

  // Trigger manual — executa imediatamente e reagenda
  async runNow(): Promise<SchedulerResult> {
    await this.runOnce();
    // Reagendar após run manual
    if (this.timer) {
      clearTimeout(this.timer);
      this.scheduleNext();
    }
    return this.lastResult ?? { feesAdjusted: 0, rebalancesStarted: 0, peersConnected: 0, forwardsSynced: 0, errors: [], timestamp: new Date() };
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.running,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      lastResult: this.lastResult,
    };
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;

    const result: SchedulerResult = {
      feesAdjusted: 0,
      rebalancesStarted: 0,
      peersConnected: 0,
      forwardsSynced: 0,
      errors: [],
      timestamp: new Date(),
    };

    try {
      const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });

      // Se nenhuma automação está ativa, não fazer nada
      if (!config || (!config.autoFeeEnabled && !config.autoRebalanceEnabled && !config.autoPeerEnabled)) {
        return;
      }

      const nodes = await prisma.node.findMany({ where: { active: true } });

      for (const node of nodes) {
        try {
          const adapter = createAdapter(node);
          const channels = await adapter.listChannels();

          // === FORWARDING HISTORY SYNC (sempre activo — popula analytics) ===
          // Usa cursor persistente lastForwardSync para só buscar eventos novos
          try {
            const syncSince = config?.lastForwardSync ?? new Date(Date.now() - 25 * 60 * 60 * 1000);
            const fwdEvents = await adapter.getForwardingHistory(syncSince, 1000);
            for (const ev of fwdEvents) {
              const evId = `${node.id}-${ev.timestamp.getTime()}-${ev.chanIdIn}-${ev.chanIdOut}`;
              await prisma.forwardingEvent.upsert({
                where: { id: evId },
                create: {
                  id: evId,
                  nodeId: node.id,
                  timestamp: ev.timestamp,
                  chanIdIn: ev.chanIdIn,
                  chanIdOut: ev.chanIdOut,
                  amtIn: ev.amtIn,
                  amtOut: ev.amtOut,
                  fee: ev.fee,
                },
                update: {},
              });
            }
            result.forwardsSynced += fwdEvents.length;
          } catch (err) {
            result.errors.push(`ForwardSync ${node.name}: ${err instanceof Error ? err.message : "Erro"}`);
          }

          // === AUTO-FEE OPTIMIZER ===
          // Ajusta fees baseado na liquidez. NUNCA causa prejuízo direto —
          // é uma estratégia de preços para maximizar routing income.
          if (config.autoFeeEnabled && channels.length > 0) {
            const suggestions = optimizeFees(channels);

            for (const s of suggestions) {
              if (s.suggestedFeeRate === s.currentFeeRate) continue;

              try {
                await adapter.updateFees(s.channelId, {
                  feeRate: s.suggestedFeeRate,
                  baseFee: s.suggestedBaseFee,
                });

                // Guardar histórico (se canal existe na DB)
                const dbChannel = await prisma.channel.findUnique({ where: { id: s.channelId } });
                if (dbChannel) {
                  await prisma.feeHistory.create({
                    data: {
                      nodeId: node.id,
                      channelId: s.channelId,
                      oldFeeRate: s.currentFeeRate,
                      newFeeRate: s.suggestedFeeRate,
                      oldBaseFee: s.currentBaseFee,
                      newBaseFee: s.suggestedBaseFee,
                      reason: `[AUTO] ${s.reason}`,
                    },
                  });
                  await prisma.channel.update({
                    where: { id: s.channelId },
                    data: { localFeeRate: s.suggestedFeeRate, baseFee: s.suggestedBaseFee },
                  });
                }

                result.feesAdjusted++;
              } catch (err) {
                result.errors.push(`Fee ${s.channelId}: ${err instanceof Error ? err.message : "Erro"}`);
              }
            }
          }

          // === AUTO-REBALANCING (com proteção anti-prejuízo) ===
          // Só rebalanceia se:
          // 1. O canal de destino tem histórico de ganhos (capacidade de routing provada)
          // 2. O custo do rebalancing é < 5% dos ganhos do último mês (garantido rentável)
          if (config.autoRebalanceEnabled && channels.length >= 2) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // Calcular ganhos por canal nos últimos 30 dias
            const earningsData = await prisma.forwardingEvent.groupBy({
              by: ["chanIdOut"],
              where: { nodeId: node.id, timestamp: { gte: thirtyDaysAgo } },
              _sum: { fee: true },
            });

            const channelEarnings = new Map(
              earningsData.map((e) => [e.chanIdOut, Number(e._sum.fee ?? 0n)])
            );

            const candidates = findRebalanceCandidates(channels);
            const overloaded = candidates.filter((c) => c.localRatio > 0.65).slice(0, 1);
            const underloaded = candidates.filter((c) => c.localRatio < 0.35).slice(0, 1);

            for (const src of overloaded) {
              for (const dst of underloaded) {
                const dstEarnings = channelEarnings.get(dst.channel.id) ?? 0;

                // Canal sem histórico de ganhos → skip (não sabemos se vale a pena)
                if (dstEarnings === 0) continue;

                const amountSat = Math.floor(Number(dst.channel.capacity) * 0.08); // 8% da capacidade
                const maxFeePpm = 30; // muito conservador — 30 ppm máximo
                const maxFeeSat = Math.ceil((amountSat * maxFeePpm) / 1_000_000);

                // Só rebalancear se custo < 5% dos ganhos do mês (proteção anti-prejuízo)
                const profitThreshold = dstEarnings * 0.05;
                if (maxFeeSat > profitThreshold || profitThreshold === 0) continue;

                try {
                  const job = await prisma.rebalanceJob.create({
                    data: {
                      nodeId: node.id,
                      fromChannel: src.channel.id,
                      toChannel: dst.channel.id,
                      amount: BigInt(amountSat),
                      status: "running",
                    },
                  });

                  // Executar de forma assíncrona (não bloqueia o loop principal)
                  runRebalanceJob(adapter, job.id, src.channel.id, dst.channel.id, amountSat, maxFeePpm).catch(
                    console.error
                  );

                  result.rebalancesStarted++;
                } catch (err) {
                  result.errors.push(`Rebalance: ${err instanceof Error ? err.message : "Erro"}`);
                }
              }
            }
          }

          // === AUTO-PEER CONNECT ===
          // Conecta automaticamente a peers de alta qualidade que não estão ligados.
          // Não abre canais (isso requer fundos e decisão humana) — apenas conecta o peer.
          if (config.autoPeerEnabled) {
            try {
              const currentPeers = await adapter.listPeers();
              const connectedPubkeys = new Set(currentPeers.map((p) => p.pubkey));

              for (const topPeer of TOP_LIGHTNING_PEERS) {
                if (connectedPubkeys.has(topPeer.pubkey)) continue;

                try {
                  await adapter.connectPeer(topPeer.pubkey, topPeer.addr);
                  result.peersConnected++;
                } catch {
                  // Ignorar erros de conexão a peers individuais (podem estar offline)
                }
              }
            } catch (err) {
              result.errors.push(`Peers: ${err instanceof Error ? err.message : "Erro"}`);
            }
          }
        } catch (err) {
          result.errors.push(`Node ${node.name}: ${err instanceof Error ? err.message : "Erro"}`);
        }
      }

      // Actualizar timestamp do último run e cursor de sync de forwards
      await prisma.appConfig.update({
        where: { id: "singleton" },
        data: { lastAutomationRun: new Date(), lastForwardSync: new Date() },
      });
    } catch (err) {
      result.errors.push(`Scheduler: ${err instanceof Error ? err.message : "Erro"}`);
    } finally {
      this.running = false;
      this.lastRun = new Date();
      this.lastResult = result;
      console.log(`[Scheduler] Concluído: forwards=${result.forwardsSynced} fees=${result.feesAdjusted} rebalances=${result.rebalancesStarted} peers=${result.peersConnected} erros=${result.errors.length}`);
    }
  }
}

// Executa rebalancing em background (não bloqueia o scheduler)
async function runRebalanceJob(
  adapter: ReturnType<typeof createAdapter>,
  jobId: string,
  fromChannel: string,
  toChannel: string,
  amountSat: number,
  maxFeePpm: number
) {
  try {
    const maxFeeMsat = Math.floor((amountSat * maxFeePpm) / 1000);
    const invoice = await adapter.createInvoice(amountSat, `Auto-rebalance ${fromChannel} → ${toChannel}`);
    const result = await adapter.sendPayment(invoice.paymentRequest, maxFeeMsat);

    const totalFeesMsat = result.route?.totalFees;
    const feePaid: bigint = totalFeesMsat != null ? BigInt(String(totalFeesMsat)) / 1000n : 0n;

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

export const scheduler = new Scheduler();
