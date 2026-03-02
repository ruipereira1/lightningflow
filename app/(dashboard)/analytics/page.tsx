"use client";

// Página de Analytics — earnings, ROI por canal, canais mortos

import { useEffect, useState } from "react";
import { useActiveNode } from "@/components/node-selector";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

interface Analytics {
  totalFeesSat: number;
  totalForwards: number;
  avgFeePerForward: number;
  dailyEarnings: { date: string; feesSat: number; count: number }[];
  topChannels: { chanId: string; earnedSat: number; count: number }[];
  channelRoi: { chanId: string; earnedSat: number; capacitySat: number; roiPercent: number; forwards: number }[];
  deadChannels: { chanId: string; capacitySat: number; feeRate: number }[];
}

const DAYS_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export default function AnalyticsPage() {
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(30);
  const [closingChanId, setClosingChanId] = useState<string | null>(null);
  const [confirmingChanId, setConfirmingChanId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (nodeId) load();
  }, [nodeId, days]);

  const load = async (sync = false) => {
    sync ? setSyncing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/analytics?nodeId=${nodeId}&days=${days}${sync ? "&sync=true" : ""}`);
      if (!res.ok) return;
      setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const fmt = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(3) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return n.toFixed(2);
  };

  const fmtSat = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M sat`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k sat`;
    return `${n} sat`;
  };

  const exportCSV = () => {
    if (!data) return;
    const rows: string[] = [
      "Tipo,Data,Canal,Fees (sat),Forwards,ROI Anual (%)",
      ...data.dailyEarnings.map((d) => `Dia,${d.date},,${d.feesSat.toFixed(4)},${d.count},`),
      "",
      "Tipo,Canal,Fees 30d (sat),Forwards,ROI Anual (%),Capacidade (sat)",
      ...data.channelRoi.map((c) => `Canal ROI,${c.chanId},${c.earnedSat.toFixed(4)},${c.forwards},${c.roiPercent.toFixed(2)},${c.capacitySat}`),
    ];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lightningflow-analytics-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCloseChannel = async (chanId: string) => {
    if (!nodeId) return;
    setClosingChanId(chanId);
    setCloseError(null);
    try {
      const res = await fetch(
        `/api/channels/${encodeURIComponent(chanId)}?nodeId=${encodeURIComponent(nodeId)}&force=false`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        setCloseError(json.error ?? "Erro ao fechar canal");
        return;
      }
      setConfirmingChanId(null);
      await load();
    } catch {
      setCloseError("Network error");
    } finally {
      setClosingChanId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-400 text-sm mt-1">Profitability and ROI of your node</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
            {DAYS_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setDays(o.value)}
                className="px-3 py-1.5 text-xs rounded-md font-medium transition-all"
                style={{
                  background: days === o.value ? "#8b5cf6" : "transparent",
                  color: days === o.value ? "#fff" : "#71717a",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}
          >
            {syncing ? "Syncing…" : "⟳ Sync"}
          </button>
          {data && data.totalForwards > 0 && (
            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)", color: "#22d3ee" }}
            >
              ⬇ CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-5" style={{ boxShadow: "0 0 24px rgba(245,158,11,0.1)" }}>
            <div className="text-xs text-zinc-500 mb-1">Earnings ({days}d)</div>
            <div className="text-2xl font-bold text-amber-400">{fmt(data.totalFeesSat)} sat</div>
            <div className="text-xs text-zinc-600 mt-1">
              {satsToEur(data.totalFeesSat, btcPrice) || "in routing fees"}
            </div>
          </div>
          <div className="glass-card p-5" style={{ boxShadow: "0 0 24px rgba(6,182,212,0.1)" }}>
            <div className="text-xs text-zinc-500 mb-1">Routed Payments</div>
            <div className="text-2xl font-bold text-cyan-400">{data.totalForwards.toLocaleString()}</div>
            <div className="text-xs text-zinc-600 mt-1">forwards processed</div>
          </div>
          <div className="glass-card p-5" style={{ boxShadow: "0 0 24px rgba(139,92,246,0.1)" }}>
            <div className="text-xs text-zinc-500 mb-1">Avg Fee/Forward</div>
            <div className="text-2xl font-bold text-purple-400">{data.avgFeePerForward.toFixed(3)} sat</div>
            <div className="text-xs text-zinc-600 mt-1">per payment</div>
          </div>
        </div>
      )}

      {/* Earnings chart */}
      {data && data.dailyEarnings.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Daily Earnings (sat)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.dailyEarnings}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
              <Tooltip
                contentStyle={{ background: "#1c1c23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v) => [Number(v).toFixed(3) + " sat", "Fees"]}
                labelFormatter={(l) => "Date: " + l}
              />
              <Area type="monotone" dataKey="feesSat" stroke="#f59e0b" strokeWidth={2} fill="url(#earnGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ROI por Canal */}
      {data && data.channelRoi.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">ROI per Channel (annualized)</h2>
            <span className="text-xs text-zinc-500">% annual return on allocated capital</span>
          </div>
          <div className="space-y-2">
            {data.channelRoi.slice(0, 8).map((c, i) => {
              const roiColor = c.roiPercent >= 5 ? "#4ade80" : c.roiPercent >= 2 ? "#f59e0b" : "#f87171";
              return (
                <div key={c.chanId} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <a
                        href={`/channels/${encodeURIComponent(c.chanId)}`}
                        className="text-xs text-zinc-400 font-mono hover:text-purple-300 transition-colors"
                      >
                        {c.chanId.slice(0, 20)}…
                      </a>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-500">{fmtSat(c.earnedSat)}</span>
                        <span className="font-bold" style={{ color: roiColor }}>{c.roiPercent.toFixed(2)}% /yr</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(c.roiPercent * 5, 100)}%`,
                          background: `linear-gradient(90deg, ${roiColor}80, ${roiColor})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top canais por revenue */}
      {data && data.topChannels.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Top Channels by Revenue</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.topChannels.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="chanId" tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => v.slice(0, 8) + "…"} />
              <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
              <Tooltip
                contentStyle={{ background: "#1c1c23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v) => [Number(v).toFixed(3) + " sat", "Earnings"]}
                labelFormatter={(l) => "Channel: " + l}
              />
              <Bar dataKey="earnedSat" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Canais mortos */}
      {data && data.deadChannels.length > 0 && (
        <div className="glass-card p-6 space-y-3" style={{ borderColor: "rgba(251,146,60,0.3)" }}>
          <div className="flex items-center gap-2">
            <span className="text-base">💤</span>
            <h2 className="text-sm font-semibold text-orange-400">
              {data.deadChannels.length} Canal{data.deadChannels.length !== 1 ? "is" : ""} Morto{data.deadChannels.length !== 1 ? "s" : ""}
            </h2>
            <span className="text-xs text-zinc-500">— no activity in the last {days} days</span>
          </div>
          <p className="text-xs text-zinc-500">
            These channels have allocated capital but generate no routing fees. Consider closing and reopening with more active peers.
          </p>
          {closeError && (
            <div className="p-3 rounded-lg text-xs text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {closeError}
            </div>
          )}
          <div className="space-y-2">
            {data.deadChannels.map((c) => (
              <div
                key={c.chanId}
                className="flex items-center justify-between p-3 rounded-lg gap-3"
                style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.15)" }}
              >
                <span className="text-xs text-zinc-400 font-mono truncate flex-1">{c.chanId.slice(0, 24)}…</span>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  <span className="text-zinc-500">{fmtSat(c.capacitySat)}</span>
                  <span className="text-zinc-500">{c.feeRate} ppm</span>
                  <span className="text-orange-400 font-medium">0 forwards</span>
                  {confirmingChanId === c.chanId ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleCloseChannel(c.chanId)}
                        disabled={closingChanId === c.chanId}
                        className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-40"
                      >
                        {closingChanId === c.chanId ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => { setConfirmingChanId(null); setCloseError(null); }}
                        className="px-2 py-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingChanId(c.chanId)}
                      className="px-2 py-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Fechar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!nodeId && (
        <div className="glass-card p-12 text-center text-zinc-500">
          Select a node in the sidebar to view analytics
        </div>
      )}
      {nodeId && !loading && data && data.totalForwards === 0 && (
        <div className="glass-card p-12 text-center space-y-2">
          <p className="text-zinc-400 font-medium">No forwarding events found</p>
          <p className="text-sm text-zinc-600">Click "Sync" to load the node's history</p>
        </div>
      )}
    </div>
  );
}
