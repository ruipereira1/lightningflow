"use client";

// Página de Rebalancing — move liquidez entre canais

import { useEffect, useState } from "react";
import { useActiveNode } from "@/components/node-selector";

interface Channel {
  id: string;
  remotePubkey: string;
  remoteAlias?: string;
  localBalance: string;
  remoteBalance: string;
  capacity: string;
  localRatio: number;
  active: boolean;
}

interface RebalanceJob {
  id: string;
  fromChannel: string;
  toChannel: string;
  amount: string;
  feePaid?: string;
  status: string;
  error?: string;
  createdAt: string;
}

export default function RebalancePage() {
  const { nodeId } = useActiveNode();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [jobs, setJobs] = useState<RebalanceJob[]>([]);
  const [fromChannel, setFromChannel] = useState("");
  const [toChannel, setToChannel] = useState("");
  const [amount, setAmount] = useState("");
  const [maxFeePpm, setMaxFeePpm] = useState("100");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (nodeId) loadData(); }, [nodeId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ch, jb] = await Promise.all([
        fetch("/api/channels?nodeId=" + nodeId).then((r) => r.json()),
        fetch("/api/rebalance?nodeId=" + nodeId).then((r) => r.json()),
      ]);
      setChannels(Array.isArray(ch) ? ch.filter((c: Channel) => c.active) : []);
      setJobs(Array.isArray(jb) ? jb : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const submitRebalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromChannel || !toChannel || !amount) return;
    if (fromChannel === toChannel) {
      setMsg({ type: "error", text: "Canal origem e destino devem ser diferentes" });
      return;
    }
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, fromChannel, toChannel, amountSat: parseInt(amount), maxFeePpm: parseInt(maxFeePpm) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMsg({ type: "success", text: "Rebalance iniciado (ID: " + d.jobId + ")" });
      await loadData();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Erro ao iniciar rebalance" });
    } finally { setSubmitting(false); }
  };

  const highLocal = channels.filter((c) => c.localRatio > 0.6).sort((a, b) => b.localRatio - a.localRatio);
  const lowLocal = channels.filter((c) => c.localRatio < 0.4).sort((a, b) => a.localRatio - b.localRatio);

  const fmtSat = (s: string | number) => {
    const n = Number(s);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M sat";
    if (n >= 1_000) return (n / 1_000).toFixed(0) + "k sat";
    return n + " sat";
  };

  const statusStyle: Record<string, { background: string; color: string }> = {
    pending:  { background: "rgba(245,158,11,0.15)", color: "#fbbf24" },
    running:  { background: "rgba(96,165,250,0.15)", color: "#60a5fa" },
    success:  { background: "rgba(74,222,128,0.15)", color: "#4ade80" },
    failed:   { background: "rgba(239,68,68,0.15)", color: "#f87171" },
  };

  const selectStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rebalancing</h1>
          <p className="text-zinc-400 text-sm mt-1">Move liquidez entre canais para maximizar routing revenue</p>
        </div>
        <button onClick={loadData} disabled={loading}
          className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {loading ? "⟳" : "↻ Atualizar"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Novo Rebalance</h2>
          <form onSubmit={submitRebalance} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Canal Origem (excesso local)</label>
              <select value={fromChannel} onChange={(e) => setFromChannel(e.target.value)}
                required className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                style={selectStyle}>
                <option value="">Selecionar origem…</option>
                {(highLocal.length > 0 ? highLocal : channels).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.remoteAlias || c.remotePubkey.slice(0, 16) + "…"} — {Math.round(c.localRatio * 100)}% local
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Canal Destino (precisa de local)</label>
              <select value={toChannel} onChange={(e) => setToChannel(e.target.value)}
                required className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                style={selectStyle}>
                <option value="">Selecionar destino…</option>
                {(lowLocal.length > 0 ? lowLocal : channels).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.remoteAlias || c.remotePubkey.slice(0, 16) + "…"} — {Math.round(c.localRatio * 100)}% local
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Montante (sat)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="ex: 500000" min="10000" required
                  className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Fee Máxima (ppm)</label>
                <input type="number" value={maxFeePpm} onChange={(e) => setMaxFeePpm(e.target.value)}
                  min="1" max="1000"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>
            </div>

            {amount && maxFeePpm && (
              <div className="p-2 rounded-lg text-xs text-zinc-400"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                Fee máxima estimada:{" "}
                <span className="text-purple-400 font-medium">
                  {((parseInt(amount) * parseInt(maxFeePpm)) / 1_000_000).toFixed(0)} sat
                </span>
              </div>
            )}

            {msg && (
              <div className="p-2 rounded-lg text-xs" style={{
                background: msg.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
                color: msg.type === "success" ? "#4ade80" : "#f87171",
                border: "1px solid", borderColor: msg.type === "success" ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
              }}>
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#8b5cf6" }}>
              {submitting ? "A iniciar rebalance…" : "⚖️ Iniciar Rebalance"}
            </button>
          </form>
        </div>

        {/* Sugestões rápidas */}
        <div className="space-y-3">
          <div className="glass-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Excesso Local → Enviar</h3>
            {highLocal.slice(0, 5).map((c) => (
              <button key={c.id} onClick={() => setFromChannel(c.id)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all"
                style={{
                  background: fromChannel === c.id ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: fromChannel === c.id ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.06)",
                }}>
                <span className="text-sm text-zinc-300 truncate">
                  {c.remoteAlias || c.remotePubkey.slice(0, 16) + "…"}
                </span>
                <span className="text-orange-400 font-semibold text-xs flex-shrink-0 ml-2">
                  {Math.round(c.localRatio * 100)}% local
                </span>
              </button>
            ))}
            {highLocal.length === 0 && <p className="text-xs text-zinc-600">Nenhum canal com excesso</p>}
          </div>

          <div className="glass-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Falta Local → Receber</h3>
            {lowLocal.slice(0, 5).map((c) => (
              <button key={c.id} onClick={() => setToChannel(c.id)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all"
                style={{
                  background: toChannel === c.id ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)",
                  border: "1px solid",
                  borderColor: toChannel === c.id ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.06)",
                }}>
                <span className="text-sm text-zinc-300 truncate">
                  {c.remoteAlias || c.remotePubkey.slice(0, 16) + "…"}
                </span>
                <span className="text-cyan-400 font-semibold text-xs flex-shrink-0 ml-2">
                  {Math.round(c.localRatio * 100)}% local
                </span>
              </button>
            ))}
            {lowLocal.length === 0 && <p className="text-xs text-zinc-600">Nenhum canal com falta</p>}
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Histórico de Rebalances</h2>
        {jobs.map((job) => (
          <div key={job.id} className="glass-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                  <span>{job.fromChannel.slice(0, 12)}…</span>
                  <span className="text-zinc-600">→</span>
                  <span>{job.toChannel.slice(0, 12)}…</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className="text-zinc-300">{fmtSat(job.amount)}</span>
                  {job.feePaid && <span className="text-zinc-500 text-xs">Fee: {fmtSat(job.feePaid)}</span>}
                  {job.error && <span className="text-red-400 text-xs">{job.error}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={statusStyle[job.status] ?? { background: "rgba(255,255,255,0.1)", color: "#a1a1aa" }}>
                  {job.status}
                </span>
                <span className="text-xs text-zinc-600">
                  {new Date(job.createdAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="glass-card p-8 text-center text-zinc-500 text-sm">
            Nenhum rebalance executado ainda
          </div>
        )}
      </div>
    </div>
  );
}
