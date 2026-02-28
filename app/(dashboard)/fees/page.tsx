"use client";

// Página de Gestão de Fees — optimizer, presets rápidos, edição manual

import { useEffect, useState } from "react";
import { useActiveNode } from "@/components/node-selector";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";

interface Channel {
  id: string;
  remotePubkey: string;
  remoteAlias?: string;
  capacity: string;
  localFeeRate: number;
  baseFee: number;
  localRatio: number;
  active: boolean;
}

interface Suggestion {
  channelId: string;
  remotePubkey: string;
  remoteAlias?: string;
  currentFeeRate: number;
  suggestedFeeRate: number;
  currentBaseFee: number;
  suggestedBaseFee: number;
  localRatio: number;
  reason: string;
  urgency: "low" | "medium" | "high";
}

const FEE_PRESETS = [
  { label: "Conservador", ppm: 50, base: 1000, desc: "Canais com pouca atividade — fees baixas para atrair routing", color: "#4ade80" },
  { label: "Equilibrado", ppm: 200, base: 1000, desc: "Fee padrão para a maioria dos canais Lightning", color: "#f59e0b" },
  { label: "Agressivo", ppm: 500, base: 1000, desc: "Canais premium com alta liquidez e boa conectividade", color: "#f87171" },
];

export default function FeesPage() {
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [tab, setTab] = useState<"optimizer" | "manual">("optimizer");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (nodeId) loadData(); }, [nodeId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ch, sg] = await Promise.all([
        fetch("/api/channels?nodeId=" + nodeId).then((r) => r.json()),
        fetch("/api/fees/optimize?nodeId=" + nodeId).then((r) => r.json()),
      ]);
      setChannels(Array.isArray(ch) ? ch : []);
      setSuggestions(Array.isArray(sg) ? sg : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const applySuggestion = async (channelId: string, feeRate: number, baseFee: number) => {
    setApplying(channelId); setMsg(null);
    try {
      const res = await fetch("/api/fees/" + channelId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, feeRate, baseFee, reason: "optimizer" }),
      });
      if (!res.ok) throw new Error();
      setMsg({ type: "success", text: "Fee atualizada" });
      await loadData();
    } catch { setMsg({ type: "error", text: "Erro ao atualizar fee" }); }
    finally { setApplying(null); }
  };

  const applyAll = async () => {
    setApplyingAll(true); setMsg(null);
    try {
      const res = await fetch("/api/fees/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      const d = await res.json();
      setMsg({ type: "success", text: `${d.applied} fees atualizadas` });
      await loadData();
    } catch { setMsg({ type: "error", text: "Erro ao aplicar sugestões" }); }
    finally { setApplyingAll(false); }
  };

  const applyPreset = async (ppm: number, base: number, label: string) => {
    if (!confirm(`Aplicar fee ${label} (${ppm} ppm) a TODOS os ${channels.length} canais?`)) return;
    setApplyingPreset(label); setMsg(null);
    let applied = 0;
    try {
      for (const ch of channels) {
        await fetch("/api/fees/" + ch.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId, feeRate: ppm, baseFee: base, reason: `preset:${label}` }),
        });
        applied++;
      }
      setMsg({ type: "success", text: `Preset ${label} aplicado a ${applied} canais` });
      await loadData();
    } catch { setMsg({ type: "error", text: "Erro ao aplicar preset" }); }
    finally { setApplyingPreset(null); }
  };

  const urgencyStyle = {
    high: { background: "rgba(239,68,68,0.15)", color: "#f87171" },
    medium: { background: "rgba(245,158,11,0.15)", color: "#fbbf24" },
    low: { background: "rgba(74,222,128,0.15)", color: "#4ade80" },
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Fees</h1>
          <p className="text-zinc-400 text-sm mt-1">Otimiza fees para maximizar routing revenue</p>
        </div>
        <button onClick={loadData} disabled={loading}
          className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {loading ? "⟳" : "↻ Atualizar"}
        </button>
      </div>

      {/* Feedback */}
      {msg && (
        <div className="p-3 rounded-lg text-sm" style={{
          background: msg.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
          border: "1px solid", borderColor: msg.type === "success" ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
          color: msg.type === "success" ? "#4ade80" : "#f87171",
        }}>
          {msg.text}
        </div>
      )}

      {/* Presets rápidos */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Presets Rápidos</h2>
          <span className="text-xs text-zinc-500">Aplica a todos os canais de uma vez</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {FEE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.ppm, p.base, p.label)}
              disabled={!!applyingPreset || channels.length === 0}
              className="p-4 rounded-lg text-left transition-all duration-150 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="font-semibold text-sm" style={{ color: p.color }}>{p.label}</div>
              <div className="text-lg font-bold text-white mt-1">{p.ppm} ppm</div>
              <div className="text-xs text-zinc-500 mt-1">{p.desc}</div>
              {applyingPreset === p.label && (
                <div className="text-xs mt-2" style={{ color: p.color }}>A aplicar…</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
        {(["optimizer", "manual"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 text-sm rounded-md transition-all font-medium"
            style={{ background: tab === t ? "#8b5cf6" : "transparent", color: tab === t ? "#fff" : "#71717a" }}>
            {t === "optimizer"
              ? `Fee Optimizer${suggestions.length > 0 ? ` (${suggestions.length})` : ""}`
              : "Edição Manual"}
          </button>
        ))}
      </div>

      {/* Tab: Optimizer */}
      {tab === "optimizer" && (
        <div className="space-y-3">
          {suggestions.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">{suggestions.length} sugestões encontradas</p>
              <button onClick={applyAll} disabled={applyingAll}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
                style={{ background: "#8b5cf6" }}>
                {applyingAll ? "A aplicar…" : `Aplicar Todas (${suggestions.length})`}
              </button>
            </div>
          )}

          {suggestions.length === 0 && !loading && (
            <div className="glass-card p-10 text-center space-y-2">
              <div className="text-2xl">✅</div>
              <p className="text-white font-medium">Todas as fees estão otimizadas!</p>
              <p className="text-xs text-zinc-500">Os teus canais têm fees adequadas à liquidez atual.</p>
            </div>
          )}

          {suggestions.map((s) => (
            <div key={s.channelId} className="glass-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a
                      href={`/channels/${encodeURIComponent(s.channelId)}`}
                      className="font-medium text-sm text-white hover:text-purple-300 transition-colors"
                    >
                      {s.remoteAlias || s.remotePubkey.slice(0, 16) + "…"}
                    </a>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={urgencyStyle[s.urgency]}>
                      {s.urgency === "high" ? "Urgente" : s.urgency === "medium" ? "Recomendado" : "Sugestão"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{s.reason}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="text-zinc-400">{s.currentFeeRate} ppm</span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-semibold" style={{ color: s.suggestedFeeRate > s.currentFeeRate ? "#4ade80" : "#60a5fa" }}>
                      {s.suggestedFeeRate} ppm
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => applySuggestion(s.channelId, s.suggestedFeeRate, s.suggestedBaseFee)}
                  disabled={applying === s.channelId}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-colors flex-shrink-0"
                  style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.5)" }}>
                  {applying === s.channelId ? "…" : "Aplicar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Manual */}
      {tab === "manual" && (
        <div className="space-y-2">
          {channels.map((ch) => (
            <ManualCard key={ch.id} channel={ch} nodeId={nodeId} btcPrice={btcPrice} onUpdate={loadData} />
          ))}
          {channels.length === 0 && !loading && (
            <div className="glass-card p-8 text-center text-zinc-500 text-sm">
              Nenhum canal encontrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ManualCard({ channel, nodeId, btcPrice, onUpdate }: { channel: Channel; nodeId: string; btcPrice: number | null; onUpdate: () => void }) {
  const [feeRate, setFeeRate] = useState(channel.localFeeRate.toString());
  const [baseFee, setBaseFee] = useState(channel.baseFee.toString());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/fees/" + channel.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, feeRate: parseInt(feeRate), baseFee: parseInt(baseFee), reason: "manual" }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate();
    } finally { setSaving(false); }
  };

  const localPct = Math.round(channel.localRatio * 100);

  return (
    <div className="glass-card p-4" style={{ opacity: channel.active ? 1 : 0.6 }}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <a
            href={`/channels/${encodeURIComponent(channel.id)}`}
            className="text-sm font-medium text-white hover:text-purple-300 transition-colors block"
          >
            {channel.remoteAlias || channel.remotePubkey.slice(0, 20) + "…"}
          </a>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
            <span>
              Liquidez: <span className={localPct < 30 || localPct > 70 ? "text-orange-400" : "text-zinc-400"}>{localPct}%</span>
            </span>
            {Number(channel.capacity) > 0 && (
              <span className="text-zinc-700">
                · {(Number(channel.capacity) / 1_000_000).toFixed(2)}M sat
                {btcPrice ? ` · ${satsToEur(Number(channel.capacity), btcPrice)}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Fee Rate (ppm)</label>
            <input type="number" value={feeRate} onChange={(e) => setFeeRate(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              min="0" max="10000" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Base (msat)</label>
            <input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-lg text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              min="0" />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 transition-colors"
            style={{ background: saved ? "#4ade80" : "#8b5cf6", color: saved ? "#000" : "#fff" }}>
            {saving ? "…" : saved ? "✓" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
