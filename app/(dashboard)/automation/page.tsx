"use client";

// Página de Automação — configura e monitoriza as automações do nó
// Fees automáticas, rebalancing automático e conexão automática a peers de qualidade

import { useEffect, useState } from "react";
import { TOP_LIGHTNING_PEERS } from "@/lib/top-peers";

interface AutomationConfig {
  autoFeeEnabled: boolean;
  autoRebalanceEnabled: boolean;
  autoPeerEnabled: boolean;
  automationInterval: number;
  lastAutomationRun: string | null;
}

interface SchedulerStatus {
  running: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: {
    feesAdjusted: number;
    rebalancesStarted: number;
    peersConnected: number;
    errors: string[];
    timestamp: string;
  } | null;
}

interface FeeHistoryEntry {
  id: string;
  channelId: string;
  oldFeeRate: number;
  newFeeRate: number;
  reason: string | null;
  createdAt: string;
}

interface RebalanceJob {
  id: string;
  fromChannel: string;
  toChannel: string;
  amount: string;
  feePaid: string | null;
  status: string;
  createdAt: string;
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 1440, label: "24 hours" },
];

export default function AutomationPage() {
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [feeHistory, setFeeHistory] = useState<FeeHistoryEntry[]>([]);
  const [rebalanceJobs, setRebalanceJobs] = useState<RebalanceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadAll();
    // Atualizar status a cada 10s
    const interval = setInterval(loadStatus, 10_000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadConfig(), loadStatus(), loadActivity()]);
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    const r = await fetch("/api/automation");
    if (!r.ok) return;
    const data = await r.json();
    setConfig(data.config);
  };

  const loadStatus = async () => {
    const r = await fetch("/api/automation/run");
    if (!r.ok) return;
    setStatus(await r.json());
  };

  const loadActivity = async () => {
    // Carregar histórico de fees e rebalances recentes para o log de atividade
    // Usa o nodeId guardado no localStorage se disponível
    const nodeId = typeof window !== "undefined" ? localStorage.getItem("lf_active_node") : null;
    if (!nodeId) return;

    const [feesR, rebalR] = await Promise.all([
      fetch(`/api/fee-history?nodeId=${nodeId}&limit=20`).catch(() => null),
      fetch(`/api/rebalance?nodeId=${nodeId}`).catch(() => null),
    ]);

    if (feesR?.ok) setFeeHistory(await feesR.json());
    if (rebalR?.ok) setRebalanceJobs(await rebalR.json());
  };

  const saveConfig = async (updates: Partial<AutomationConfig>) => {
    const r = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!r.ok) return;
    const data = await r.json();
    setConfig(data.config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await fetch("/api/automation/run", { method: "POST" });
      await Promise.all([loadStatus(), loadActivity()]);
    } finally {
      setRunning(false);
    }
  };

  const toggle = (field: keyof AutomationConfig) => {
    if (!config) return;
    const newVal = !config[field];
    setConfig({ ...config, [field]: newVal });
    saveConfig({ [field]: newVal });
  };

  const setInterval_ = (val: number) => {
    if (!config) return;
    setConfig({ ...config, automationInterval: val });
    saveConfig({ automationInterval: val });
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    return `${h}h ago`;
  };

  const anyActive = config?.autoFeeEnabled || config?.autoRebalanceEnabled || config?.autoPeerEnabled;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation</h1>
          <p className="text-zinc-400 text-sm mt-1">
            The system works 24/7 to maximize your node's profitability
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running || !anyActive}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          {running ? (
            <>
              <span className="animate-spin">⟳</span> A executar...
            </>
          ) : (
            <>⚡ Executar Agora</>
          )}
        </button>
      </div>

      {/* Status bar */}
      {status && (
        <div className="glass-card p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${status.running ? "bg-yellow-400 animate-pulse" : anyActive ? "bg-green-400" : "bg-zinc-600"}`} />
            <span className="text-sm text-zinc-300">
              {status.running ? "Running..." : anyActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex gap-6 text-xs text-zinc-500">
            <span>Last run: <span className="text-zinc-300">{timeAgo(status.lastRun)}</span></span>
            <span>Next: <span className="text-zinc-300">{timeAgo(status.nextRun) === "Never" ? "—" : status.nextRun ? new Date(status.nextRun).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "—"}</span></span>
            {status.lastResult && (
              <>
                <span>Fees: <span className="text-purple-400">{status.lastResult.feesAdjusted}</span></span>
                <span>Rebalances: <span className="text-cyan-400">{status.lastResult.rebalancesStarted}</span></span>
                <span>Peers: <span className="text-green-400">{status.lastResult.peersConnected}</span></span>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Loading...</div>
      ) : (
        <>
          {/* Configuração global */}
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-white">Global Configuration</h2>

            {/* Intervalo */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Interval between executions</label>
              <div className="flex gap-2 flex-wrap">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setInterval_(opt.value)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                    style={{
                      background: config?.automationInterval === opt.value
                        ? "#8b5cf6"
                        : "rgba(255,255,255,0.06)",
                      color: config?.automationInterval === opt.value
                        ? "#ffffff"
                        : "#71717a",
                      border: "1px solid",
                      borderColor: config?.automationInterval === opt.value
                        ? "rgba(139,92,246,0.5)"
                        : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {saved && (
              <div className="text-xs text-green-400">✓ Saved</div>
            )}
          </div>

          {/* Automações disponíveis */}
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">

            {/* Auto-Fees */}
            <AutomationCard
              icon="💰"
              title="Auto-Fees"
              description="Automatically adjusts fees based on each channel's liquidity. Raises fees when you have lots of outbound liquidity, lowers when it's scarce."
              active={config?.autoFeeEnabled ?? false}
              onToggle={() => toggle("autoFeeEnabled")}
              badge="Risk-free"
              badgeColor="green"
              details={[
                "Liquidity > 70% local → raise fee",
                "Liquidity < 30% local → lower fee",
                `Limits: 1–2000 ppm`,
              ]}
            />

            {/* Auto-Rebalancing */}
            <AutomationCard
              icon="⚖️"
              title="Auto-Rebalancing"
              description="Automatically rebalances channels. ONLY when cost is < 5% of the channel's monthly earnings — guaranteed no loss."
              active={config?.autoRebalanceEnabled ?? false}
              onToggle={() => toggle("autoRebalanceEnabled")}
              badge="Anti-loss"
              badgeColor="cyan"
              details={[
                "Only rebalances channels with history",
                "Max cost: 5% of earnings/month",
                "Max 30 ppm per rebalancing",
              ]}
            />

            {/* Auto-Peers */}
            <AutomationCard
              icon="🌐"
              title="Auto-Peers"
              description={`Automatically connects to ${TOP_LIGHTNING_PEERS.length} high-quality Lightning nodes (ACINQ, Kraken, Bitfinex...) to improve routing.`}
              active={config?.autoPeerEnabled ?? false}
              onToggle={() => toggle("autoPeerEnabled")}
              badge="Safe"
              badgeColor="purple"
              details={TOP_LIGHTNING_PEERS.map((p) => p.alias)}
            />
          </div>

          {/* Log de atividade */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Activity Log</h2>

            {status?.lastResult && status.lastResult.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs font-medium text-red-400 mb-1">Errors in last run:</p>
                {status.lastResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-300">{e}</p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {rebalanceJobs.slice(0, 5).map((job) => (
                <ActivityRow
                  key={job.id}
                  icon="⚖️"
                  label={`Rebalance ${job.fromChannel.slice(0, 8)}… → ${job.toChannel.slice(0, 8)}…`}
                  detail={`${Number(job.amount).toLocaleString()} sat`}
                  status={job.status}
                  date={job.createdAt}
                />
              ))}
              {feeHistory.slice(0, 10).map((entry) => (
                <ActivityRow
                  key={entry.id}
                  icon="💰"
                  label={`Fee ${entry.channelId.slice(0, 12)}…`}
                  detail={`${entry.oldFeeRate} → ${entry.newFeeRate} ppm`}
                  status="success"
                  date={entry.createdAt}
                  auto={entry.reason?.startsWith("[AUTO]")}
                />
              ))}
              {rebalanceJobs.length === 0 && feeHistory.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-4">
                  No activity yet. Enable automation and click &ldquo;Run Now&rdquo;.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AutomationCard({
  icon, title, description, active, onToggle, badge, badgeColor, details,
}: {
  icon: string;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  badge: string;
  badgeColor: "green" | "cyan" | "purple";
  details: string[];
}) {
  const badgeClasses = {
    green: "bg-green-500/15 text-green-400",
    cyan: "bg-cyan-500/15 text-cyan-400",
    purple: "bg-purple-500/15 text-purple-400",
  };

  return (
    <div
      className="glass-card p-5 space-y-4 transition-all duration-200"
      style={{ borderColor: active ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="font-semibold text-white text-sm">{title}</div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClasses[badgeColor]}`}>{badge}</span>
          </div>
        </div>
        {/* Toggle switch */}
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={active}
          className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          style={{ background: active ? "#8b5cf6" : "#3f3f46" }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{ transform: active ? "translateX(20px)" : "translateX(0px)" }}
          />
        </button>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>

      <ul className="space-y-1">
        {details.map((d, i) => (
          <li key={i} className="text-xs text-zinc-500 flex items-center gap-1.5">
            <span className="text-purple-500">›</span> {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({
  icon, label, detail, status, date, auto,
}: {
  icon: string;
  label: string;
  detail: string;
  status: string;
  date: string;
  auto?: boolean;
}) {
  const statusColor = {
    success: "text-green-400",
    failed: "text-red-400",
    running: "text-yellow-400",
    pending: "text-zinc-400",
  }[status] ?? "text-zinc-400";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300 truncate">{label}</span>
          {auto && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">AUTO</span>}
        </div>
        <span className="text-xs text-zinc-500">{detail}</span>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`text-xs font-medium ${statusColor}`}>{status}</div>
        <div className="text-xs text-zinc-600">
          {new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
