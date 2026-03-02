"use client";

// Página de Peers — lista peers conectados, conectar novos

import { useEffect, useState } from "react";
import { useActiveNode } from "@/components/node-selector";
import { TOP_LIGHTNING_PEERS } from "@/lib/top-peers";

interface Peer {
  pubkey: string;
  alias?: string;
  address?: string;
  connected: boolean;
  bytesRecv?: number;
  bytesSent?: number;
}

export default function PeersPage() {
  const { nodeId } = useActiveNode();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(false);
  const [pubkey, setPubkey] = useState("");
  const [host, setHost] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectingTop, setConnectingTop] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (nodeId) loadPeers(); }, [nodeId]);

  const loadPeers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/peers?nodeId=" + nodeId);
      const data = await res.json();
      setPeers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const connectPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true); setMsg(null);
    try {
      const res = await fetch("/api/peers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, pubkey, host }),
      });
      if (!res.ok) throw new Error("Erro ao conectar");
      setMsg({ type: "success", text: "Peer connected successfully" });
      setPubkey(""); setHost("");
      await loadPeers();
    } catch { setMsg({ type: "error", text: "Error connecting to peer" }); }
    finally { setConnecting(false); }
  };

  const connectTopPeer = async (p: typeof TOP_LIGHTNING_PEERS[0]) => {
    setConnectingTop(p.pubkey); setMsg(null);
    try {
      const res = await fetch("/api/peers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, pubkey: p.pubkey, host: p.addr }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao conectar");
      setMsg({ type: "success", text: `Connected to ${p.alias}` });
      await loadPeers();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Erro";
      if (errMsg.toLowerCase().includes("already") || errMsg.toLowerCase().includes("connected")) {
        setMsg({ type: "success", text: `Already connected to ${p.alias}` });
      } else {
        setMsg({ type: "error", text: errMsg });
      }
      await loadPeers();
    } finally { setConnectingTop(null); }
  };

  const fmtBytes = (b?: number) => {
    if (!b) return "0 B";
    if (b > 1_000_000) return (b / 1_000_000).toFixed(1) + " MB";
    if (b > 1_000) return (b / 1_000).toFixed(1) + " KB";
    return b + " B";
  };

  const connectedPubkeys = new Set(peers.map((p) => p.pubkey));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Peers</h1>
          <p className="text-zinc-400 text-sm mt-1">{peers.length} peer{peers.length !== 1 ? "s" : ""} conectado{peers.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={loadPeers} disabled={loading}
          className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {loading ? "⟳" : "↻ Refresh"}
        </button>
      </div>

      {msg && (
        <div className="p-3 rounded-lg text-sm" style={{
          background: msg.type === "success" ? "rgba(74,222,128,0.1)" : "rgba(239,68,68,0.1)",
          border: "1px solid", borderColor: msg.type === "success" ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)",
          color: msg.type === "success" ? "#4ade80" : "#f87171",
        }}>
          {msg.text}
        </div>
      )}

      {/* Top Peers recomendados */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recommended Top Peers</h2>
          <span className="text-xs text-zinc-500">High-quality Lightning Network nodes</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {TOP_LIGHTNING_PEERS.map((p) => {
            const isConnected = connectedPubkeys.has(p.pubkey);
            const isConnecting = connectingTop === p.pubkey;
            return (
              <div key={p.pubkey} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{p.alias}</div>
                  <div className="text-xs text-zinc-500 font-mono">{p.pubkey.slice(0, 16)}…</div>
                </div>
                {isConnected ? (
                  <span className="text-xs px-2 py-1 rounded-lg flex-shrink-0 ml-2"
                    style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>✓ Connected</span>
                ) : (
                  <button onClick={() => connectTopPeer(p)} disabled={isConnecting}
                    className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 ml-2 disabled:opacity-40 transition-colors"
                    style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }}>
                    {isConnecting ? "…" : "Connect"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conectar manualmente */}
      <div className="glass-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Connect Peer Manually</h2>
        <form onSubmit={connectPeer} className="flex gap-2 flex-wrap">
          <input value={pubkey} onChange={(e) => setPubkey(e.target.value)}
            placeholder="Public key (pubkey)" required
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
          <input value={host} onChange={(e) => setHost(e.target.value)}
            placeholder="host:port" required
            className="w-48 px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
          <button type="submit" disabled={connecting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ background: "#8b5cf6" }}>
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>

      {/* Lista de peers */}
      <div className="space-y-2">
        {peers.map((peer) => (
          <div key={peer.pubkey} className="glass-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-sm text-white">
                    {peer.alias || peer.pubkey.slice(0, 20) + "…"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={
                    peer.connected
                      ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
                      : { background: "rgba(161,161,170,0.15)", color: "#71717a" }
                  }>
                    {peer.connected ? "Connected" : "Disconnected"}
                  </span>
                  <a
                    href={`https://amboss.space/node/${peer.pubkey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 hover:opacity-80 transition-opacity"
                    style={{ background: "rgba(14,165,233,0.1)", color: "#38bdf8", border: "1px solid rgba(14,165,233,0.18)" }}
                  >
                    Amboss ↗
                  </a>
                </div>
                <div className="font-mono text-xs text-zinc-600 truncate">{peer.pubkey}</div>
                {peer.address && <div className="text-xs text-zinc-500 mt-0.5">{peer.address}</div>}
              </div>
              {(peer.bytesRecv || peer.bytesSent) && (
                <div className="text-right text-xs text-zinc-500 flex-shrink-0 space-y-0.5">
                  <div>↓ {fmtBytes(peer.bytesRecv)}</div>
                  <div>↑ {fmtBytes(peer.bytesSent)}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {peers.length === 0 && !loading && (
          <div className="glass-card p-8 text-center text-zinc-500 text-sm">
            No peers connected. Connect to one of the Top Peers above to get started.
          </div>
        )}
      </div>
    </div>
  );
}
