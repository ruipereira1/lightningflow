"use client";

// Página de Canais — lista canais, mostra wallet on-chain, permite abrir/fechar canais

import { useEffect, useState } from "react";
import { useActiveNode } from "@/components/node-selector";
import { TOP_LIGHTNING_PEERS } from "@/lib/top-peers";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";

interface Channel {
  id: string;
  remotePubkey: string;
  remoteAlias?: string;
  capacity: string;
  localBalance: string;
  remoteBalance: string;
  active: boolean;
  localFeeRate: number;
  baseFee: number;
  localRatio: number;
}

interface WalletBalance {
  confirmedSat: string;
  unconfirmedSat: string;
}

// ──────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────

export default function ChannelsPage() {
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"capacity" | "localRatio" | "active">("capacity");
  const [showModal, setShowModal] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    loadAll();
  }, [nodeId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadChannels(), loadWallet()]);
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    const res = await fetch(`/api/channels?nodeId=${nodeId}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setChannels(Array.isArray(data) ? data : []);
  };

  const loadWallet = async () => {
    const res = await fetch(`/api/wallet?nodeId=${nodeId}`).catch(() => null);
    if (!res?.ok) return;
    setWallet(await res.json());
  };

  const closeChannel = async (channelId: string, force: boolean) => {
    setClosingId(channelId);
    try {
      await fetch(
        `/api/channels/${encodeURIComponent(channelId)}?nodeId=${encodeURIComponent(nodeId)}&force=${force}`,
        { method: "DELETE" }
      );
      await loadChannels();
    } finally {
      setClosingId(null);
    }
  };

  const sorted = [...channels].sort((a, b) => {
    if (sortBy === "capacity") return Number(BigInt(b.capacity) - BigInt(a.capacity));
    if (sortBy === "localRatio") return b.localRatio - a.localRatio;
    if (sortBy === "active") return (b.active ? 1 : 0) - (a.active ? 1 : 0);
    return 0;
  });

  const totalCapacity = channels.reduce((s, c) => s + Number(c.capacity), 0);
  const totalLocal = channels.reduce((s, c) => s + Number(c.localBalance), 0);
  const activeCount = channels.filter((c) => c.active).length;
  const walletConfirmed = wallet ? Number(wallet.confirmedSat) : null;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Canais</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {activeCount}/{channels.length} ativos · {formatSat(totalCapacity)} capacidade · {formatSat(totalLocal)} local
          </p>
        </div>
        <div className="flex items-center gap-4">
          {walletConfirmed !== null && (
            <div className="text-right">
              <div className="text-xs text-zinc-500">Wallet on-chain</div>
              <div className={`text-sm font-semibold ${walletConfirmed > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                {formatSat(walletConfirmed)}
              </div>
              {btcPrice && walletConfirmed > 0 && (
                <div className="text-xs text-zinc-500">{satsToEur(walletConfirmed, btcPrice)}</div>
              )}
              {wallet && Number(wallet.unconfirmedSat) > 0 && (
                <div className="text-xs text-zinc-600">+{formatSat(Number(wallet.unconfirmedSat))} pendente</div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs rounded-lg px-3 py-2 text-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <option value="capacity">Capacidade</option>
              <option value="localRatio">Liquidez Local</option>
              <option value="active">Estado</option>
            </select>
            <button
              onClick={loadAll}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {loading ? "⟳" : "↻ Atualizar"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              disabled={!nodeId}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              + Abrir Canal
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {channels.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Canais Ativos" value={`${activeCount}/${channels.length}`} color="purple" />
          <SummaryCard label="Capacidade Total" value={formatSat(totalCapacity)} color="cyan" />
          <SummaryCard label="Liquidez Local" value={`${Math.round((totalLocal / totalCapacity) * 100)}%`} color={totalLocal / totalCapacity > 0.7 || totalLocal / totalCapacity < 0.3 ? "orange" : "green"} />
        </div>
      )}

      {!nodeId && (
        <div className="glass-card p-12 text-center text-zinc-500">
          Seleciona um nó no menu lateral para ver os canais
        </div>
      )}

      {/* Channels list */}
      <div className="space-y-3">
        {sorted.map((ch) => (
          <ChannelCard
            key={ch.id}
            channel={ch}
            closing={closingId === ch.id}
            onClose={(force) => closeChannel(ch.id, force)}
          />
        ))}
      </div>

      {nodeId && channels.length === 0 && !loading && (
        <div className="glass-card p-12 text-center">
          <p className="text-zinc-500 text-sm mb-4">Nenhum canal encontrado neste nó</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            + Abrir Primeiro Canal
          </button>
        </div>
      )}

      {/* Modal de abertura de canal */}
      {showModal && (
        <OpenChannelModal
          nodeId={nodeId}
          walletSat={walletConfirmed ?? 0}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadAll(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Summary Card
// ──────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    purple: "text-purple-400",
    cyan: "text-cyan-400",
    green: "text-green-400",
    orange: "text-orange-400",
  };
  return (
    <div className="glass-card p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${colors[color] ?? "text-white"}`}>{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Channel Card
// ──────────────────────────────────────────────

function ChannelCard({
  channel, closing, onClose,
}: {
  channel: Channel;
  closing: boolean;
  onClose: (force: boolean) => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const localPct = Math.round(channel.localRatio * 100);
  const debalanced = localPct > 70 || localPct < 30;
  const capacitySat = Number(channel.capacity);
  const localSat = Number(channel.localBalance);
  const remoteSat = Number(channel.remoteBalance);

  return (
    <div
      className="glass-card p-5 transition-all duration-200"
      style={{
        opacity: channel.active ? 1 : 0.6,
        borderColor: channel.active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <a
              href={`/channels/${encodeURIComponent(channel.id)}`}
              className="font-medium text-white text-sm truncate hover:text-purple-300 transition-colors"
            >
              {channel.remoteAlias || `${channel.remotePubkey.slice(0, 20)}…`}
            </a>
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                background: channel.active ? "rgba(74,222,128,0.15)" : "rgba(161,161,170,0.15)",
                color: channel.active ? "#4ade80" : "#71717a",
              }}
            >
              {channel.active ? "Ativo" : "Inativo"}
            </span>
            {debalanced && (
              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                Desequilibrado
              </span>
            )}
            <a
              href={`https://amboss.space/node/${channel.remotePubkey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ background: "rgba(14,165,233,0.1)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.18)" }}
            >
              Amboss ↗
            </a>
          </div>
          <div className="text-xs text-zinc-600 font-mono truncate">{channel.id}</div>
        </div>

        {/* Fees + Fechar */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-medium text-purple-400">{channel.localFeeRate} ppm</div>
            <div className="text-xs text-zinc-500">{channel.baseFee} msat base</div>
          </div>
          {!confirmClose ? (
            <button
              onClick={() => setConfirmClose(true)}
              className="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Fechar
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => { onClose(false); setConfirmClose(false); }}
                disabled={closing}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40"
              >
                {closing ? "…" : "Cooperativo"}
              </button>
              <button
                onClick={() => { onClose(true); setConfirmClose(false); }}
                disabled={closing}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/40 text-red-300 hover:bg-red-500/50 transition-colors disabled:opacity-40"
              >
                Forçar
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                className="text-xs px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Liquidity bar */}
      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Local: <span className="text-zinc-300">{formatSat(localSat)}</span></span>
          <span className={debalanced ? "text-orange-400 font-medium" : "text-zinc-400"}>
            {localPct}% local
          </span>
          <span>Remoto: <span className="text-zinc-300">{formatSat(remoteSat)}</span></span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{
              width: `${localPct}%`,
              background: debalanced
                ? "linear-gradient(90deg, #f97316, #ef4444)"
                : "linear-gradient(90deg, #8b5cf6, #06b6d4)",
            }}
          />
          <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "rgba(255,255,255,0.2)" }} />
        </div>
        <div className="text-xs text-zinc-600 text-right">Capacidade: {formatSat(capacitySat)}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Modal de Abertura de Canal
// ──────────────────────────────────────────────

function OpenChannelModal({
  nodeId, walletSat, onClose, onSuccess,
}: {
  nodeId: string;
  walletSat: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<"peers" | "manual">("peers");
  const [selectedPeer, setSelectedPeer] = useState<{ pubkey: string; alias: string; addr: string } | null>(null);
  const [manualAddr, setManualAddr] = useState("");
  const [amountSat, setAmountSat] = useState(1_000_000);
  const [feeRate, setFeeRate] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const parsedManual = tab === "manual" ? parseManualAddr(manualAddr) : null;
  const canOpen = tab === "peers"
    ? selectedPeer !== null && amountSat >= 20_000
    : parsedManual !== null && amountSat >= 20_000;

  const openChannel = async () => {
    const target = tab === "peers"
      ? { pubkey: selectedPeer!.pubkey, host: selectedPeer!.addr }
      : { pubkey: parsedManual!.pubkey, host: parsedManual!.host };

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/channels/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, ...target, amountSat, feeRate }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: data.message ?? "Canal aberto com sucesso!" });
        setTimeout(onSuccess, 2000);
      } else {
        setResult({ ok: false, message: data.error ?? "Erro desconhecido" });
      }
    } catch (err) {
      setResult({ ok: false, message: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full max-w-lg p-6 space-y-5" style={{ borderColor: "rgba(139,92,246,0.3)" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Abrir Canal Lightning</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl">✕</button>
        </div>

        {walletSat > 0 && (
          <div className="text-xs text-zinc-500">
            Disponível on-chain: <span className="text-amber-400 font-medium">{formatSat(walletSat)}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["peers", "manual"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm rounded-md transition-all duration-150 font-medium"
              style={{
                background: tab === t ? "#8b5cf6" : "transparent",
                color: tab === t ? "#fff" : "#71717a",
              }}
            >
              {t === "peers" ? "Top Peers" : "Manual"}
            </button>
          ))}
        </div>

        {/* Tab: Top Peers */}
        {tab === "peers" && (
          <div className="space-y-2">
            {TOP_LIGHTNING_PEERS.map((peer) => (
              <button
                key={peer.pubkey}
                onClick={() => setSelectedPeer(selectedPeer?.pubkey === peer.pubkey ? null : peer)}
                className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-all duration-150"
                style={{
                  background: selectedPeer?.pubkey === peer.pubkey
                    ? "rgba(139,92,246,0.2)"
                    : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: selectedPeer?.pubkey === peer.pubkey
                    ? "rgba(139,92,246,0.5)"
                    : "rgba(255,255,255,0.08)",
                }}
              >
                <div>
                  <div className="text-sm font-medium text-white">{peer.alias}</div>
                  <div className="text-xs text-zinc-500 font-mono">{peer.pubkey.slice(0, 24)}…</div>
                </div>
                {selectedPeer?.pubkey === peer.pubkey && (
                  <span className="text-purple-400 text-sm">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Tab: Manual */}
        {tab === "manual" && (
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Endereço do peer (pubkey@host:port)</label>
            <input
              type="text"
              value={manualAddr}
              onChange={(e) => setManualAddr(e.target.value)}
              placeholder="03abcdef...@1.2.3.4:9735"
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            {manualAddr && !parsedManual && (
              <p className="text-xs text-red-400">Formato inválido. Use: pubkey@host:port</p>
            )}
          </div>
        )}

        {/* Amount + Fee Rate */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Valor (sat)</label>
            <input
              type="number"
              value={amountSat}
              onChange={(e) => setAmountSat(Number(e.target.value))}
              min={20_000}
              step={100_000}
              className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <p className="text-xs text-zinc-600">Mín. 20.000 sat</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Fee on-chain (sat/vbyte)</label>
            <input
              type="number"
              value={feeRate}
              onChange={(e) => setFeeRate(Number(e.target.value))}
              min={1}
              max={500}
              className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>

        {/* Feedback */}
        {result && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              background: result.ok ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
              border: "1px solid",
              borderColor: result.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
              color: result.ok ? "#4ade80" : "#f87171",
            }}
          >
            {result.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Cancelar
          </button>
          <button
            onClick={openChannel}
            disabled={!canOpen || loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: canOpen && !loading ? "#8b5cf6" : "#52526e" }}
          >
            {loading ? "A abrir…" : "⚡ Abrir Canal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────

function formatSat(sat: number): string {
  if (sat >= 100_000_000) return `${(sat / 100_000_000).toFixed(4)} BTC`;
  if (sat >= 1_000_000) return `${(sat / 1_000_000).toFixed(2)}M sat`;
  if (sat >= 1_000) return `${(sat / 1_000).toFixed(0)}k sat`;
  return `${sat} sat`;
}

function parseManualAddr(addr: string): { pubkey: string; host: string } | null {
  const match = addr.trim().match(/^([0-9a-fA-F]{66})@([^@]+)$/);
  if (!match) return null;
  return { pubkey: match[1], host: match[2] };
}
