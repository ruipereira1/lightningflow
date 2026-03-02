// Interface do Lightning Adapter — abstrai LND e CLN
// Toda a app usa esta interface, sem saber qual nó está por baixo

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

export interface LightningAdapter {
  // Informação do nó
  getInfo(): Promise<NodeInfo>;

  // Gestão de canais
  listChannels(): Promise<Channel[]>;
  getChannel(channelId: string): Promise<Channel | null>;
  closeChannel(channelId: string, force?: boolean): Promise<void>;

  // Gestão de fees
  updateFees(channelId: string, policy: FeePolicy): Promise<void>;
  getFeeReport(): Promise<{ channelId: string; feeRate: number; baseFee: number }[]>;

  // Pagamentos (usado para rebalancing)
  sendPayment(invoice: string, maxFeeMsat: number): Promise<PaymentResult>;
  createInvoice(amountSat: number, memo?: string): Promise<{ paymentRequest: string; rHash: string }>;
  lookupInvoice(rHash: string): Promise<{ status: "pending" | "settled" | "expired"; settledAt: Date | null }>;
  estimateRoute(destPubkey: string, amountSat: number): Promise<RouteEstimate | null>;

  // Histórico
  getForwardingHistory(sinceDate?: Date, limit?: number): Promise<ForwardingEvent[]>;

  // Peers
  listPeers(): Promise<Peer[]>;
  connectPeer(pubkey: string, host: string): Promise<void>;

  // Abertura de canais
  openChannel(pubkey: string, amountSat: number, feeRateSatPerVbyte?: number): Promise<string>;

  // Wallet on-chain
  getWalletBalance(): Promise<{ confirmedSat: bigint; unconfirmedSat: bigint }>;

  // Eventos em tempo real
  subscribeChannelEvents(callback: (event: ChannelEvent) => void): () => void;
}

// Tipo do nó guardado na DB
export interface NodeConfig {
  id: string;
  type: "lnd" | "cln";
  host: string;
  macaroon?: string | null;
  cert?: string | null;
  rune?: string | null;
}
