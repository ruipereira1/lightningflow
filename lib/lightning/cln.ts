// Adapter para Core Lightning (CLN)
// Usa a REST API oficial do CLN (plugin clnrest)

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

export class CLNAdapter implements LightningAdapter {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: NodeConfig) {
    // CLN REST API — porta configurável, normalmente 3010
    this.baseUrl = `http://${config.host}`;
    this.headers = {
      "Content-Type": "application/json",
      // Rune é o token de autenticação do CLN (como o macaroon do LND)
      ...(config.rune ? { Rune: config.rune } : {}),
    };
  }

  // Método auxiliar para fazer chamadas à API
  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/v1/${method}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CLN API error ${response.status}: ${error}`);
    }

    return response.json();
  }

  async getInfo(): Promise<NodeInfo> {
    const info = await this.call<Record<string, unknown>>("getinfo");
    const channels = await this.call<{ channels: unknown[] }>("listchannels", { source: info.id });
    const active = (channels.channels ?? []).filter((c: unknown) => 
      (c as Record<string, unknown>).active === true
    ).length;

    return {
      pubkey: String(info.id),
      alias: String(info.alias ?? ""),
      color: String(info.color ?? "#000000"),
      numActiveChannels: active,
      numPendingChannels: 0,
      numPeers: Array.isArray(info.address) ? info.address.length : 0,
      blockHeight: Number(info.blockheight ?? 0),
      synced: true,
      version: String(info.version ?? ""),
    };
  }

  async listChannels(): Promise<Channel[]> {
    const result = await this.call<{ channels: Record<string, unknown>[] }>("listchannels");
    const myInfo = await this.getInfo();

    return result.channels
      .filter((c) => c.source === myInfo.pubkey)
      .map((c) => {
        const capacity = BigInt(String(c.satoshis ?? c.capacity ?? 0));
        const localMsat = BigInt(String(c.receivable_msat ?? "0").replace("msat", ""));
        const local = localMsat / 1000n;
        const remote = capacity - local;
        const localNum = Number(local);
        const total = Number(capacity);

        return {
          id: String(c.short_channel_id),
          remotePubkey: String(c.destination),
          remoteAlias: c.alias as string | undefined,
          capacity,
          localBalance: local,
          remoteBalance: remote,
          active: Boolean(c.active),
          localFeeRate: Number(c.fee_per_millionth ?? 0),
          baseFee: Number(String(c.base_fee_millisatoshi ?? "1000").replace("msat", "")),
          remoteFeeRate: undefined,
          localRatio: total > 0 ? localNum / total : 0.5,
        };
      });
  }

  async getChannel(channelId: string): Promise<Channel | null> {
    const channels = await this.listChannels();
    return channels.find((c) => c.id === channelId) ?? null;
  }

  async closeChannel(channelId: string, force = false): Promise<void> {
    await this.call("close", {
      id: channelId,
      unilateraltimeout: force ? 1 : undefined,
    });
  }

  async updateFees(channelId: string, policy: FeePolicy): Promise<void> {
    await this.call("setchannelfee", {
      id: channelId,
      ppm: policy.feeRate,
      base: policy.baseFee,
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
    const result = await this.call<Record<string, unknown>>("pay", {
      bolt11: invoice,
      maxfeepercent: maxFeeMsat / 10000, // aproximação
    });
    return {
      preimage: String(result.payment_preimage),
    };
  }

  async createInvoice(amountSat: number, memo = "LightningFlow"): Promise<{ paymentRequest: string; rHash: string }> {
    const result = await this.call<Record<string, unknown>>("invoice", {
      amount_msat: amountSat * 1000,
      label: `lf-${Date.now()}`,
      description: memo,
    });
    return {
      paymentRequest: String(result.bolt11),
      rHash: String(result.payment_hash),
    };
  }

  async estimateRoute(_destPubkey: string, _amountSat: number): Promise<RouteEstimate | null> {
    // CLN não tem um endpoint simples de estimativa de rota
    return null;
  }

  async getForwardingHistory(sinceDate?: Date, limit = 1000): Promise<ForwardingEvent[]> {
    const params: Record<string, unknown> = { limit };
    if (sinceDate) {
      params.start = Math.floor(sinceDate.getTime() / 1000);
    }

    const result = await this.call<{ forwards: Record<string, unknown>[] }>("listforwards", params);

    return result.forwards
      .filter((f) => f.status === "settled")
      .map((f) => ({
        timestamp: new Date(Number(f.received_time ?? 0) * 1000),
        chanIdIn: String(f.in_channel),
        chanIdOut: String(f.out_channel),
        amtIn: BigInt(String(f.in_msat ?? "0").replace("msat", "")),
        amtOut: BigInt(String(f.out_msat ?? "0").replace("msat", "")),
        fee: BigInt(String(f.fee_msat ?? "0").replace("msat", "")),
      }));
  }

  async listPeers(): Promise<Peer[]> {
    const result = await this.call<{ peers: Record<string, unknown>[] }>("listpeers");
    return result.peers.map((p) => ({
      pubkey: String(p.id),
      alias: p.alias as string | undefined,
      connected: Boolean(p.connected),
    }));
  }

  async connectPeer(pubkey: string, host: string): Promise<void> {
    await this.call("connect", { id: `${pubkey}@${host}` });
  }

  async openChannel(pubkey: string, amountSat: number, feeRateSatPerVbyte = 1): Promise<string> {
    const result = await this.call<Record<string, unknown>>("fundchannel", {
      id: pubkey,
      amount: amountSat,
      feerate: `${feeRateSatPerVbyte * 1000}perkb`,
    });
    return `${result.txid}:${result.outnum}`;
  }

  async getWalletBalance(): Promise<{ confirmedSat: bigint; unconfirmedSat: bigint }> {
    const result = await this.call<{ outputs: Record<string, unknown>[] }>("listfunds");
    const outputs = result.outputs ?? [];
    const sumMsat = (arr: Record<string, unknown>[]) =>
      arr.reduce((s, o) => s + BigInt(String(o.amount_msat ?? 0)), 0n) / 1000n;
    return {
      confirmedSat: sumMsat(outputs.filter((o) => o.status === "confirmed")),
      unconfirmedSat: sumMsat(outputs.filter((o) => o.status !== "confirmed")),
    };
  }

  subscribeChannelEvents(_callback: (event: ChannelEvent) => void): () => void {
    // CLN REST não suporta SSE nativamente nesta versão
    // Implementar polling como fallback
    const interval = setInterval(() => {
      // polling implementado no lado do servidor com SSE
    }, 30000);
    return () => clearInterval(interval);
  }
}
