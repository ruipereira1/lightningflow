// Tipos partilhados para LND e CLN
// Toda a app usa estes tipos — o adapter converte para eles

export interface NodeInfo {
  pubkey: string;
  alias: string;
  color: string;
  numActiveChannels: number;
  numPendingChannels: number;
  numPeers: number;
  blockHeight: number;
  synced: boolean;
  version: string;
}

export interface Channel {
  id: string;               // short channel ID (ex: "121x1x0")
  remotePubkey: string;
  remoteAlias?: string;
  capacity: bigint;         // satoshis
  localBalance: bigint;     // satoshis
  remoteBalance: bigint;    // satoshis
  active: boolean;
  localFeeRate: number;     // ppm
  baseFee: number;          // msat
  remoteFeeRate?: number;
  transactionId?: string;   // funding txid (necessário para updateRoutingFees/closeChannel)
  transactionVout?: number; // funding output index
  // Métricas calculadas
  localRatio: number;       // 0-1, percentagem do saldo local
}

export interface FeePolicy {
  feeRate: number;  // ppm
  baseFee: number;  // msat
  timeLockDelta?: number;
}

export interface Peer {
  pubkey: string;
  alias?: string;
  address?: string;
  connected: boolean;
  bytesRecv?: number;
  bytesSent?: number;
}

export interface ForwardingEvent {
  timestamp: Date;
  chanIdIn: string;
  chanIdOut: string;
  amtIn: bigint;   // msat
  amtOut: bigint;  // msat
  fee: bigint;     // msat
}

export interface PaymentResult {
  preimage: string;
  route?: {
    totalFees: bigint;
    totalAmt: bigint;
    hops: Array<{ chanId: string; fee: bigint }>;
  };
}

export interface ChannelEvent {
  type: "open" | "close" | "update" | "active" | "inactive";
  channelId?: string;
}

export interface RouteEstimate {
  totalFees: bigint;  // msat
  hops: number;
}
