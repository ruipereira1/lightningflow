"use client";

// Página de Detalhe de Canal — informação completa, fee history, earnings
import { useEffect, useState, use } from "react";
import { useActiveNode } from "@/components/node-selector";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";

interface ChannelDetail {
  id: string;
  remotePubkey: string;
  remoteAlias: string | null;
  capacity: string;
  localBalance: string;
  remoteBalance: string;
  active: boolean;
  localFeeRate: number;
  baseFee: number;
  remoteFeeRate: number | null;
  localRatio: number;
  updatedAt: string;
  feeHistory: { id: string; oldFeeRate: number; newFeeRate: number; reason: string | null; createdAt: string }[];
  earnings30d: { feeSat: number; forwards: number };
}

function formatSat(n: number | string): string {
  const v = Number(n);
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(4)} BTC`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M sat`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k sat`;
  return `${v} sat`;
}

export default function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();

  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fee editor
  const [editFeeRate, setEditFeeRate] = useState("");
  const [editBaseFee, setEditBaseFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Close channel
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId || !id) return;
    load();
  }, [nodeId, id]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${encodeURIComponent(id)}?nodeId=${nodeId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro"); return; }
      setChannel(data);
      setEditFeeRate(String(data.localFeeRate));
      setEditBaseFee(String(data.baseFee));
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  };

  const saveFees = async () => {
    if (!channel || !nodeId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/fees/${encodeURIComponent(channel.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, feeRate: Number(editFeeRate), baseFee: Number(editBaseFee) }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveMsg({ ok: false, text: data.error ?? "Erro ao guardar" }); return; }
      setSaveMsg({ ok: true, text: "Fees actualizadas com sucesso" });
      await load();
    } catch {
      setSaveMsg({ ok: false, text: "Erro de rede" });
    } finally {
      setSaving(false);
    }
  };

  const closeChannel = async (force: boolean) => {
    if (!nodeId || !channel) return;
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch(
        `/api/channels/${encodeURIComponent(channel.id)}?nodeId=${encodeURIComponent(nodeId)}&force=${force}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) { setCloseError(data.error ?? "Erro"); return; }
      // Redirecionar para lista de canais
      window.location.href = "/channels";
    } catch {
      setCloseError("Erro de rede");
    } finally {
      setClosing(false);
    }
  };

  if (!nodeId) {
    return (
      <div className="glass-card p-12 text-center text-zinc-500">
        Seleciona um nó no menu lateral
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card p-12 text-center text-zinc-500 animate-pulse">
        A carregar canal…
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <p className="text-red-400">{error ?? "Canal não encontrado"}</p>
        <a href="/channels" className="text-xs text-zinc-500 hover:text-zinc-300 underline">← Voltar a Canais</a>
      </div>
    );
  }

  const localPct = Math.round(channel.localRatio * 100);
  const debalanced = localPct > 70 || localPct < 30;
  const capacityNum = Number(channel.capacity);
  const roi30dPct = channel.earnings30d.feeSat > 0 && capacityNum > 0
    ? ((channel.earnings30d.feeSat / capacityNum) * (365 / 30) * 100).toFixed(2)
    : null;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <a href="/channels" className="hover:text-zinc-300 transition-colors">Canais</a>
        <span>/</span>
        <span className="text-zinc-300 truncate">{channel.remoteAlias ?? channel.id.slice(0, 20) + "…"}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">
              {channel.remoteAlias ?? `${channel.remotePubkey.slice(0, 20)}…`}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={channel.active
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
                : { background: "rgba(161,161,170,0.15)", color: "#71717a" }
              }
            >
              {channel.active ? "Ativo" : "Inativo"}
            </span>
          </div>
          <p className="text-xs text-zinc-600 font-mono mt-1 break-all">{channel.remotePubkey}</p>
        </div>
        <a
          href={`https://amboss.space/node/${channel.remotePubkey}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity flex-shrink-0"
          style={{ background: "rgba(14,165,233,0.1)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.18)" }}
        >
          Ver no Amboss ↗
        </a>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="text-xs text-zinc-500 mb-1">Capacidade</div>
          <div className="text-base font-bold text-white">{formatSat(channel.capacity)}</div>
          {btcPrice && <div className="text-xs text-zinc-600 mt-0.5">{satsToEur(Number(channel.capacity), btcPrice)}</div>}
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-zinc-500 mb-1">Liquidez Local</div>
          <div className={`text-base font-bold ${debalanced ? "text-orange-400" : "text-green-400"}`}>
            {localPct}%
          </div>
          <div className="text-xs text-zinc-600 mt-0.5">{formatSat(channel.localBalance)}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-zinc-500 mb-1">Earnings 30d</div>
          <div className="text-base font-bold text-amber-400">{channel.earnings30d.feeSat.toFixed(3)} sat</div>
          <div className="text-xs text-zinc-600 mt-0.5">{channel.earnings30d.forwards} forwards</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-xs text-zinc-500 mb-1">ROI Anual.</div>
          <div className={`text-base font-bold ${roi30dPct ? (Number(roi30dPct) >= 5 ? "text-green-400" : Number(roi30dPct) >= 2 ? "text-amber-400" : "text-red-400") : "text-zinc-600"}`}>
            {roi30dPct ? `${roi30dPct}%` : "—"}
          </div>
          <div className="text-xs text-zinc-600 mt-0.5">sobre capital</div>
        </div>
      </div>

      {/* Barra de liquidez */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Local: <span className="text-zinc-300 font-medium">{formatSat(channel.localBalance)}</span></span>
          <span className={debalanced ? "text-orange-400 font-semibold" : "text-zinc-400"}>{localPct}% local</span>
          <span>Remoto: <span className="text-zinc-300 font-medium">{formatSat(channel.remoteBalance)}</span></span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{
              width: `${localPct}%`,
              background: debalanced
                ? "linear-gradient(90deg, #f97316, #ef4444)"
                : "linear-gradient(90deg, #8b5cf6, #06b6d4)",
            }}
          />
          <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "rgba(255,255,255,0.25)" }} />
        </div>
        <div className="text-xs text-zinc-600 text-center">
          Capacidade total: {formatSat(channel.capacity)}
          {btcPrice && ` · ${satsToEur(Number(channel.capacity), btcPrice)}`}
        </div>
      </div>

      {/* Fees actuais + editor */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Configuração de Fees</h2>
          {channel.remoteFeeRate != null && (
            <span className="text-xs text-zinc-500">
              Peer cobra: <span className="text-zinc-300">{channel.remoteFeeRate} ppm</span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Fee Rate (ppm)</label>
            <input
              type="number"
              value={editFeeRate}
              onChange={(e) => setEditFeeRate(e.target.value)}
              min={0} max={10000}
              className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Base Fee (msat)</label>
            <input
              type="number"
              value={editBaseFee}
              onChange={(e) => setEditBaseFee(e.target.value)}
              min={0} max={10000}
              className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </div>
        {saveMsg && (
          <div
            className="p-2 rounded-lg text-xs"
            style={{
              background: saveMsg.ok ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
              color: saveMsg.ok ? "#4ade80" : "#f87171",
              border: `1px solid ${saveMsg.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {saveMsg.text}
          </div>
        )}
        <button
          onClick={saveFees}
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
          style={{ background: "#8b5cf6" }}
        >
          {saving ? "A guardar…" : "💾 Guardar Fees"}
        </button>
      </div>

      {/* Histórico de fees */}
      {channel.feeHistory.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Histórico de Fees</h2>
            <a
              href="/fee-history"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Ver tudo →
            </a>
          </div>
          <div className="space-y-2">
            {channel.feeHistory.map((h) => {
              const d = h.newFeeRate - h.oldFeeRate;
              const auto = h.reason?.startsWith("[AUTO]") ?? false;
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={auto
                      ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa" }
                      : { background: "rgba(6,182,212,0.15)", color: "#22d3ee" }
                    }
                  >
                    {auto ? "Auto" : "Manual"}
                  </span>
                  <span className="text-xs text-zinc-500 flex-1 truncate">
                    {h.reason?.replace("[AUTO] ", "") ?? ""}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-xs">
                    <span className="text-zinc-500">{h.oldFeeRate}</span>
                    <span className="text-zinc-700">→</span>
                    <span className="font-medium" style={{ color: d > 0 ? "#4ade80" : d < 0 ? "#f87171" : "#71717a" }}>
                      {h.newFeeRate} ppm
                    </span>
                  </div>
                  <span className="text-xs text-zinc-700 flex-shrink-0">
                    {new Date(h.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fechar Canal */}
      <div className="glass-card p-5 space-y-3" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
        <h2 className="text-sm font-semibold text-red-400">Zona de Perigo</h2>
        <p className="text-xs text-zinc-500">
          Fechar o canal devolve os fundos para a tua wallet on-chain. O fecho cooperativo pode demorar alguns blocos.
        </p>
        {closeError && (
          <div className="p-2 rounded-lg text-xs text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            {closeError}
          </div>
        )}
        {!confirmClose ? (
          <button
            onClick={() => setConfirmClose(true)}
            className="px-4 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 transition-colors"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            Fechar Canal…
          </button>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => closeChannel(false)}
              disabled={closing}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              {closing ? "A fechar…" : "Fecho Cooperativo"}
            </button>
            <button
              onClick={() => closeChannel(true)}
              disabled={closing}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.3)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.5)" }}
            >
              Forçar Fecho
            </button>
            <button
              onClick={() => { setConfirmClose(false); setCloseError(null); }}
              className="px-4 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
