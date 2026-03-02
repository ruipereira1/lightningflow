// Dashboard principal — visão geral do nó
"use client";

import { useEffect, useState, useCallback } from "react";
import { useActiveNode } from "@/components/node-selector";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";
import { useSSE } from "@/lib/use-sse";
import { useNotifications } from "@/lib/notifications";

interface NodeInfo {
  pubkey: string;
  alias: string;
  numActiveChannels: number;
  numPendingChannels: number;
  numPeers: number;
  blockHeight: number;
  synced: boolean;
}

interface Analytics {
  totalFeesSat: number;
  totalForwards: number;
  avgFeePerForward: number;
  deadChannels?: { chanId: string; capacitySat: number }[];
}

interface ChannelData {
  id: string;
  active: boolean;
  localRatio: number;
}

export default function DashboardPage() {
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();
  const { addNotification } = useNotifications();
  const [sseConnected, setSseConnected] = useState(false);
  const [info, setInfo] = useState<NodeInfo | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [channels, setChannels] = useState<{ active: number; inactive: number }>({ active: 0, inactive: 0 });
  const [allChannels, setAllChannels] = useState<ChannelData[]>([]);
  const [wallet, setWallet] = useState<{ confirmedSat: string; unconfirmedSat: string } | null>(null);
  const [peers, setPeers] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nodeId) return;
    loadData();
  }, [nodeId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nodeTestRes, channelsRes, analyticsRes, walletRes, peersRes] = await Promise.all([
        fetch(`/api/nodes/${nodeId}/test`, { method: "POST" }).then((r) => r.json()),
        fetch(`/api/channels?nodeId=${nodeId}`).then((r) => r.json()),
        fetch(`/api/analytics?nodeId=${nodeId}&days=30`).then((r) => r.json()),
        fetch(`/api/wallet?nodeId=${nodeId}`).then((r) => r.json()),
        fetch(`/api/peers?nodeId=${nodeId}`).then((r) => r.json()),
      ]);

      if (nodeTestRes?.info) setInfo(nodeTestRes.info);

      if (Array.isArray(channelsRes)) {
        const active = channelsRes.filter((c: { active: boolean }) => c.active).length;
        setChannels({ active, inactive: channelsRes.length - active });
        setAllChannels(channelsRes);
      }

      if (walletRes?.confirmedSat) setWallet(walletRes);
      if (Array.isArray(peersRes)) setPeers(peersRes.length);
      setAnalytics(analyticsRes);
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handler SSE — atualiza UI em tempo real com eventos do nó
  const handleSSEEvent = useCallback((event: string, data: unknown) => {
    if (event === "connected") {
      setSseConnected(true);
    } else if (event === "nodeInfo") {
      const d = data as { numActiveChannels?: number };
      if (d.numActiveChannels != null) {
        setChannels((prev) => ({ ...prev, active: d.numActiveChannels! }));
      }
    } else if (event === "channel") {
      const d = data as { type?: string; id?: string };
      if (d.type === "closed") {
        addNotification("warning", "Channel closed", `Channel ${d.id ?? ""} was closed`);
        loadData();
      } else if (d.type === "opened") {
        addNotification("success", "Channel opened", `Channel ${d.id ?? ""} is active`);
        loadData();
      }
    }
  }, [addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  useSSE(nodeId, handleSSEEvent);

  if (!nodeId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <div className="text-5xl">⚡</div>
        <div>
          <h2 className="text-xl font-semibold">Welcome to LightningFlow</h2>
          <p className="text-muted-foreground mt-2">
            Go to <strong>Settings</strong> to add your first Lightning node
          </p>
        </div>
      </div>
    );
  }

  // Alertas: canais inativos, liquidez crítica (<10% local), canais mortos
  const offlineChannels = allChannels.filter((c) => !c.active);
  const criticalLiquidity = allChannels.filter((c) => c.active && (c.localRatio < 0.1 || c.localRatio > 0.95));
  const deadCount = analytics?.deadChannels?.length ?? 0;
  const hasAlerts = offlineChannels.length > 0 || criticalLiquidity.length > 0 || deadCount > 0;

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {hasAlerts && (
        <div className="space-y-2">
          {offlineChannels.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
              <span>⚠️</span>
              <span><strong>{offlineChannels.length} canal{offlineChannels.length !== 1 ? "is" : ""} offline</strong> — verifica a ligação ao peer</span>
            </div>
          )}
          {criticalLiquidity.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg text-sm"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
              <span>⚡</span>
              <span><strong>{criticalLiquidity.length} canal{criticalLiquidity.length !== 1 ? "is" : ""} com liquidez crítica</strong> — considera rebalancear</span>
            </div>
          )}
          {deadCount > 0 && (
            <a href="/analytics" className="flex items-center gap-3 p-3 rounded-lg text-sm hover:opacity-80 transition-opacity"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}>
              <span>💤</span>
              <span><strong>{deadCount} canal{deadCount !== 1 ? "is" : ""} sem atividade</strong> — considera fechar e redeployar capital → ver Analytics</span>
            </a>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            {sseConnected && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                Live
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: "#71717a" }}>Overview of your Lightning node</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          style={{ color: "#71717a" }}
        >
          {loading ? "⟳ Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* Cards de métricas — dark premium com glow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Channels"
          value={channels.active.toString()}
          subtitle={channels.inactive > 0 ? `${channels.inactive} inactive` : "all active"}
          accent="#10b981"
          glow="rgba(16,185,129,0.15)"
          icon="⚡"
        />
        <MetricCard
          title="On-chain Balance"
          value={wallet ? `${Number(wallet.confirmedSat).toLocaleString()} sat` : "—"}
          subtitle={
            wallet && Number(wallet.unconfirmedSat) > 0
              ? `+ ${Number(wallet.unconfirmedSat).toLocaleString()} pending`
              : satsToEur(wallet ? Number(wallet.confirmedSat) : 0, btcPrice) || (info?.alias ?? "nó lightning")
          }
          accent="#f59e0b"
          glow="rgba(245,158,11,0.15)"
          icon="💰"
        />
        <MetricCard
          title="Fees Earned (30d)"
          value={`${(analytics?.totalFeesSat ?? 0).toFixed(2)} sat`}
          subtitle={`${analytics?.totalForwards ?? 0} forwards`}
          accent="#8b5cf6"
          glow="rgba(139,92,246,0.2)"
          icon="📊"
        />
        <MetricCard
          title="Connected Peers"
          value={peers.toString()}
          subtitle={`${channels.active} channel${channels.active !== 1 ? "s" : ""}`}
          accent="#06b6d4"
          glow="rgba(6,182,212,0.15)"
          icon="🌐"
        />
      </div>

      {/* Quick actions — cards glass */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickAction
          title="Fee Optimizer"
          description="Automatically optimizes fees based on each channel's liquidity"
          href="/fees"
          icon="💡"
          badge="Auto"
        />
        <QuickAction
          title="Automation"
          description="Configure automatic rules for fees, rebalancing, and peer connections"
          href="/automation"
          icon="🤖"
          badge="New"
        />
        <QuickAction
          title="Rebalance"
          description="Move liquidity between channels to maximize routing revenue"
          href="/rebalance"
          icon="⚖️"
        />
      </div>
    </div>
  );
}

function MetricCard({
  title, value, subtitle, accent, glow, icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: string;
  glow: string;
  icon: string;
}) {
  return (
    <div
      className="glass-card p-5 space-y-3"
      style={{ boxShadow: `0 0 24px ${glow}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "#71717a" }}>{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
      <p className="text-xs" style={{ color: "#52525b" }}>{subtitle}</p>
    </div>
  );
}

function QuickAction({
  title, description, href, icon, badge,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
  badge?: string;
}) {
  return (
    <a
      href={href}
      className="glass-card p-5 block hover:border-purple-500/30 transition-all duration-200 cursor-pointer group"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-sm text-white">{title}</span>
        {badge && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm" style={{ color: "#71717a" }}>{description}</p>
    </a>
  );
}
