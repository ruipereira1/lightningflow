// Adapter para LND (Lightning Network Daemon)
// Usa a biblioteca ln-service para comunicar com o nó via gRPC/REST

import { createRequire } from "module";
import type { LightningAdapter, NodeConfig } from "./adapter";
import type {
  NodeInfo,
  Channel,
  FeePolicy,
  Peer,
  ForwardingEvent,
  PaymentResult,
  ChannelEvent,
  RouteEstimate,
} from "./types";

// ln-service é uma biblioteca CommonJS, usar require
const require = createRequire(import.meta.url);
const lnService = require("ln-service");

export class LNDAdapter implements LightningAdapter {
  private lnd: unknown; // instância do cliente LND

  constructor(config: NodeConfig) {
    // Node.js 22+ rejeita self-signed certs em gRPC — necessário para LND/Polar
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    // Criar cliente LND a partir das credenciais guardadas
    const { lnd } = lnService.authenticatedLndGrpc({
      cert: config.cert ?? "",      // TLS cert em base64
      macaroon: config.macaroon ?? "", // Macaroon em hex
      socket: config.host,          // ex: "192.168.1.10:10009"
    });
    this.lnd = lnd;
  }

  async getInfo(): Promise<NodeInfo> {
    const info = await lnService.getWalletInfo({ lnd: this.lnd });
    return {
      pubkey: info.public_key,
      alias: info.alias,
      color: info.color,
      numActiveChannels: info.active_channels_count,
      numPendingChannels: info.pending_channels_count,
      numPeers: info.peers_count,
      blockHeight: info.current_block_height,
      synced: info.is_synced_to_chain,
      version: info.version,
    };
  }

  async listChannels(): Promise<Channel[]> {
    // getChannels não retorna fee rates — precisamos de getFeeRates separadamente
    const [{ channels }, feeRatesResult] = await Promise.all([
      lnService.getChannels({ lnd: this.lnd }),
      lnService.getFeeRates({ lnd: this.lnd }).catch(() => ({ channels: [] })),
    ]);

    // Mapa de channelId → {fee_rate, base_fee_mtokens}
    const feeMap = new Map<string, { feeRate: number; baseFee: number }>();
    for (const fr of (feeRatesResult.channels ?? [])) {
      feeMap.set(String(fr.id), {
        feeRate: Number(fr.fee_rate ?? 0),
        baseFee: Number(fr.base_fee_mtokens ?? fr.base_fee ?? 1000),
      });
    }

    return channels.map((c: Record<string, unknown>) => {
      const fees = feeMap.get(String(c.id));
      return {
        id: String(c.id),
        remotePubkey: String(c.partner_public_key),
        remoteAlias: c.partner_alias as string | undefined,
        capacity: BigInt(String(c.capacity)),
        localBalance: BigInt(String(c.local_balance)),
        remoteBalance: BigInt(String(c.remote_balance)),
        active: Boolean(c.is_active),
        localFeeRate: fees?.feeRate ?? 0,
        baseFee: fees?.baseFee ?? 1000,
        remoteFeeRate: c.remote_fee_rate ? Number(c.remote_fee_rate) : undefined,
        transactionId: c.transaction_id as string | undefined,
        transactionVout: c.transaction_vout !== undefined ? Number(c.transaction_vout) : undefined,
        localRatio: Number(c.local_balance) / (Number(c.local_balance) + Number(c.remote_balance) || 1),
      };
    });
  }

  async getChannel(channelId: string): Promise<Channel | null> {
    const channels = await this.listChannels();
    return channels.find((c) => c.id === channelId) ?? null;
  }

  async closeChannel(channelId: string, force = false): Promise<void> {
    // Buscar o canal para obter o transaction_id/vout reais
    const channel = await this.getChannel(channelId);
    if (!channel?.transactionId) {
      throw new Error(`Canal ${channelId} não encontrado ou sem transactionId`);
    }
    await lnService.closeChannel({
      lnd: this.lnd,
      transaction_id: channel.transactionId,
      transaction_vout: channel.transactionVout ?? 0,
      is_force_close: force,
    });
  }

  async updateFees(channelId: string, policy: FeePolicy): Promise<void> {
    // Buscar o canal para obter o transaction_id/vout reais (ln-service exige isso)
    const channel = await this.getChannel(channelId);
    if (!channel?.transactionId) {
      throw new Error(`Canal ${channelId} não encontrado ou sem transactionId`);
    }
    await lnService.updateRoutingFees({
      lnd: this.lnd,
      transaction_id: channel.transactionId,
      transaction_vout: channel.transactionVout ?? 0,
      fee_rate: policy.feeRate,
      base_fee_mtokens: String(policy.baseFee),
      cltv_delta: policy.timeLockDelta ?? 40,
    });
  }

  async getFeeReport(): Promise<{ channelId: string; feeRate: number; baseFee: number }[]> {
    const channels = await this.listChannels();
    return channels.map((c) => ({
      channelId: c.id,
      feeRate: c.localFeeRate,
      baseFee: c.baseFee,
    }));
  }

  async sendPayment(invoice: string, maxFeeMsat: number): Promise<PaymentResult> {
    const result = await lnService.pay({
      lnd: this.lnd,
      request: invoice,
      max_fee: Math.floor(maxFeeMsat / 1000), // converter msat para sat
    });
    return {
      preimage: result.secret,
      route: result.hops
        ? {
            totalFees: BigInt(String(result.safe_fee || 0)) * 1000n,
            totalAmt: BigInt(String(result.safe_tokens || 0)) * 1000n,
            hops: result.hops.map((h: Record<string, unknown>) => ({
              chanId: String(h.channel),
              fee: BigInt(String(h.fee_mtokens || 0)),
            })),
          }
        : undefined,
    };
  }

  async createInvoice(amountSat: number, memo = "LightningFlow Rebalance"): Promise<{ paymentRequest: string; rHash: string }> {
    const result = await lnService.createInvoice({
      lnd: this.lnd,
      tokens: amountSat,
      description: memo,
    });
    return {
      paymentRequest: result.request,
      rHash: result.id,
    };
  }

  async lookupInvoice(rHash: string): Promise<{ status: "pending" | "settled" | "expired"; settledAt: Date | null }> {
    const result = await lnService.getInvoice({ lnd: this.lnd, id: rHash });
    const status = result.is_confirmed ? "settled" : result.is_canceled ? "expired" : "pending";
    const settledAt = result.confirmed_at ? new Date(result.confirmed_at) : null;
    return { status, settledAt };
  }

  async estimateRoute(destPubkey: string, amountSat: number): Promise<RouteEstimate | null> {
    try {
      const { routes } = await lnService.getRoutes({
        lnd: this.lnd,
        destination: destPubkey,
        tokens: amountSat,
      });
      if (!routes || routes.length === 0) return null;
      const best = routes[0];
      return {
        totalFees: BigInt(String(best.safe_fee || 0)) * 1000n,
        hops: best.hops?.length ?? 0,
      };
    } catch {
      return null;
    }
  }

  async getForwardingHistory(sinceDate?: Date, limit = 1000): Promise<ForwardingEvent[]> {
    const after = sinceDate?.toISOString();
    const before = new Date().toISOString(); // getForwards exige 'before' quando 'after' é fornecido
    // ln-service usa getForwards (retorna { forwards: [...] })
    const { forwards } = await lnService.getForwards({ lnd: this.lnd, after, before, limit });

    const events = forwards ?? [];
    return events.map((e: Record<string, unknown>) => ({
      timestamp: new Date(String(e.created_at ?? e.created_at ?? new Date())),
      chanIdIn: String(e.incoming_channel ?? ""),
      chanIdOut: String(e.outgoing_channel ?? ""),
      amtIn: BigInt(String(e.tokens || 0)) * 1000n,
      amtOut: BigInt(String(e.tokens || 0)) * 1000n - BigInt(String(e.fee_mtokens || 0)),
      fee: BigInt(String(e.fee_mtokens || 0)),
    }));
  }

  async listPeers(): Promise<Peer[]> {
    const { peers } = await lnService.getPeers({ lnd: this.lnd });
    return peers.map((p: Record<string, unknown>) => ({
      pubkey: String(p.public_key),
      alias: p.alias as string | undefined,
      address: p.address as string | undefined,
      connected: true,
      bytesRecv: Number(p.bytes_received ?? 0),
      bytesSent: Number(p.bytes_sent ?? 0),
    }));
  }

  async connectPeer(pubkey: string, host: string): Promise<void> {
    await lnService.addPeer({
      lnd: this.lnd,
      public_key: pubkey,
      socket: host,
    });
  }

  async openChannel(pubkey: string, amountSat: number, feeRateSatPerVbyte = 1): Promise<string> {
    const result = await lnService.openChannel({
      lnd: this.lnd,
      local_tokens: amountSat,
      partner_public_key: pubkey,
      fee_rate: feeRateSatPerVbyte,
      is_private: false,
    });
    return `${result.transaction_id}:${result.transaction_vout}`;
  }

  async getWalletBalance(): Promise<{ confirmedSat: bigint; unconfirmedSat: bigint }> {
    const b = await lnService.getChainBalance({ lnd: this.lnd });
    return {
      confirmedSat: BigInt(String(b.chain_balance ?? 0)),
      unconfirmedSat: BigInt(String(b.pending_chain_balance ?? 0)),
    };
  }

  subscribeChannelEvents(callback: (event: ChannelEvent) => void): () => void {
    const sub = lnService.subscribeToChannels({ lnd: this.lnd });

    sub.on("channel_opened", () => callback({ type: "open" }));
    sub.on("channel_closed", () => callback({ type: "close" }));
    sub.on("channel_active", () => callback({ type: "active" }));
    sub.on("channel_inactive", () => callback({ type: "inactive" }));

    // Retorna função para cancelar subscrição
    return () => sub.removeAllListeners();
  }
}
