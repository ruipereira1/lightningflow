"use client";

// Página de Histórico de Fees — registo de todas as alterações de fees (manuais e automáticas)

import { useEffect, useState, useMemo } from "react";
import { useActiveNode } from "@/components/node-selector";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface FeeRecord {
  id: string;
  channelId: string;
  remoteAlias: string | null;
  remotePubkey: string | null;
  oldFeeRate: number;
  newFeeRate: number;
  oldBaseFee: number;
  newBaseFee: number;
  reason: string | null;
  createdAt: string;
}

const LIMITS = [50, 100, 200, 500];

export default function FeeHistoryPage() {
  const { nodeId } = useActiveNode();
  const [history, setHistory] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);
  const [filterChannel, setFilterChannel] = useState("all");

  useEffect(() => {
    if (nodeId) load();
  }, [nodeId, limit]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fee-history?nodeId=${nodeId}&limit=${limit}`);
      if (!res.ok) return;
      setHistory(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Canais únicos no histórico (para o filtro)
  const channelOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of history) {
      if (!map.has(r.channelId)) {
        map.set(r.channelId, r.remoteAlias || r.channelId.slice(0, 16) + "…");
      }
    }
    return Array.from(map.entries());
  }, [history]);

  const filtered = filterChannel === "all"
    ? history
    : history.filter((r) => r.channelId === filterChannel);

  // Estatísticas
  const autoCount = filtered.filter((r) => r.reason?.startsWith("[AUTO]")).length;
  const manualCount = filtered.length - autoCount;
  const avgDelta = filtered.length > 0
    ? filtered.reduce((s, r) => s + (r.newFeeRate - r.oldFeeRate), 0) / filtered.length
    : 0;

  // Dados para o gráfico: evolução de fee por data (últimas 30 entradas do canal seleccionado)
  const chartData = useMemo(() => {
    const src = filterChannel === "all" ? [] : filtered.slice(0, 30).reverse();
    return src.map((r) => ({
      date: new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" }),
      "New fee": r.newFeeRate,
      "Old fee": r.oldFeeRate,
    }));
  }, [filtered, filterChannel]);

  const chanLabel = (r: FeeRecord) =>
    r.remoteAlias || (r.remotePubkey ? r.remotePubkey.slice(0, 16) + "…" : r.channelId.slice(0, 16) + "…");

  const isAuto = (r: FeeRecord) => r.reason?.startsWith("[AUTO]") ?? false;

  const delta = (r: FeeRecord) => r.newFeeRate - r.oldFeeRate;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Fee History</h1>
          <p className="text-zinc-400 text-sm mt-1">Complete record of all fee changes</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-xs rounded-lg px-3 py-2 text-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>Últimas {l}</option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {loading ? "⟳" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Filtro por canal */}
      {channelOptions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Filter channel:</span>
          <button
            onClick={() => setFilterChannel("all")}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
            style={{
              background: filterChannel === "all" ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
              color: filterChannel === "all" ? "#c4b5fd" : "#71717a",
              border: "1px solid",
              borderColor: filterChannel === "all" ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)",
            }}
          >
            Todos
          </button>
          {channelOptions.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilterChannel(id)}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
              style={{
                background: filterChannel === id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
                color: filterChannel === id ? "#c4b5fd" : "#71717a",
                border: "1px solid",
                borderColor: filterChannel === id ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Métricas rápidas */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="glass-card p-4">
            <div className="text-xs text-zinc-500 mb-1">Total Changes</div>
            <div className="text-xl font-bold text-white">{filtered.length}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-zinc-500 mb-1">Automatic</div>
            <div className="text-xl font-bold text-purple-400">{autoCount}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-zinc-500 mb-1">Manual</div>
            <div className="text-xl font-bold text-cyan-400">{manualCount}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-zinc-500 mb-1">Average Delta</div>
            <div className={`text-xl font-bold ${avgDelta > 0 ? "text-green-400" : avgDelta < 0 ? "text-red-400" : "text-zinc-400"}`}>
              {avgDelta > 0 ? "+" : ""}{Math.round(avgDelta)} ppm
            </div>
          </div>
        </div>
      )}

      {/* Gráfico (só quando filtrado por canal) */}
      {filterChannel !== "all" && chartData.length > 1 && (
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            Fee Evolution — {channelOptions.find(([id]) => id === filterChannel)?.[1]}
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
              <Tooltip
                contentStyle={{ background: "#1c1c23", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v) => [Number(v) + " ppm", ""]}
              />
              <Legend wrapperStyle={{ fontSize: "11px", color: "#71717a" }} />
              <Line type="monotone" dataKey="New fee" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Old fee" stroke="#71717a" strokeWidth={1} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lista de registos */}
      <div className="space-y-2">
        {filtered.map((r) => {
          const d = delta(r);
          const auto = isAuto(r);
          const cleanReason = r.reason?.replace("[AUTO] ", "") ?? null;

          return (
            <div
              key={r.id}
              className="glass-card p-4 flex items-center gap-4"
              style={{ borderLeft: `2px solid ${auto ? "rgba(139,92,246,0.5)" : "rgba(6,182,212,0.5)"}` }}
            >
              {/* Badge Tipo */}
              <div
                className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={auto
                  ? { background: "rgba(139,92,246,0.15)", color: "#a78bfa" }
                  : { background: "rgba(6,182,212,0.15)", color: "#22d3ee" }
                }
              >
                {auto ? "Auto" : "Manual"}
              </div>

              {/* Canal */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">{chanLabel(r)}</div>
                {cleanReason && (
                  <div className="text-xs text-zinc-500 mt-0.5 truncate">{cleanReason}</div>
                )}
              </div>

              {/* Fee antiga → nova */}
              <div className="flex items-center gap-2 flex-shrink-0 text-sm">
                <span className="text-zinc-500">{r.oldFeeRate} ppm</span>
                <span className="text-zinc-700">→</span>
                <span className="font-semibold" style={{ color: d > 0 ? "#4ade80" : d < 0 ? "#f87171" : "#71717a" }}>
                  {r.newFeeRate} ppm
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{
                    background: d > 0 ? "rgba(74,222,128,0.1)" : d < 0 ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.05)",
                    color: d > 0 ? "#4ade80" : d < 0 ? "#f87171" : "#71717a",
                  }}
                >
                  {d > 0 ? "+" : ""}{d}
                </span>
              </div>

              {/* Data/hora */}
              <div className="text-xs text-zinc-600 flex-shrink-0 min-w-[100px] text-right">
                {new Date(r.createdAt).toLocaleString("pt-PT", {
                  day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="glass-card p-12 text-center space-y-2">
            <p className="text-zinc-400 font-medium">No fee changes recorded</p>
            <p className="text-sm text-zinc-600">
              Fees are recorded when you use the Fee Optimizer or Automation
            </p>
          </div>
        )}
      </div>

      {!nodeId && (
        <div className="glass-card p-12 text-center text-zinc-500">
          Select a node in the sidebar to view history
        </div>
      )}
    </div>
  );
}
