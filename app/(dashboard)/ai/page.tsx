"use client";

// Página do Assistente IA — chat com Gemini/Groq + ações aplicáveis (fees, automação)

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Zap, RotateCcw, Settings, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useActiveNode } from "@/components/node-selector";

interface Action {
  type: "fee" | "automation";
  channelId?: string;
  feeRate?: number;
  baseFee?: number;
  settings?: Record<string, unknown>;
  label: string;
}

interface Message {
  role: "user" | "model";
  content: string;
  provider?: string;
  error?: boolean;
  actions?: Action[];
}

const ACTION_RE = /\s*%%ACTIONS%%(\[[\s\S]*?\])%%END%%/;

function parseActions(raw: string): { text: string; actions: Action[] } {
  const match = raw.match(ACTION_RE);
  if (!match) return { text: raw, actions: [] };
  try {
    const actions: Action[] = JSON.parse(match[1]);
    return { text: raw.replace(ACTION_RE, "").trim(), actions };
  } catch {
    return { text: raw.replace(ACTION_RE, "").trim(), actions: [] };
  }
}

function ActionButton({ action, nodeId }: { action: Action; nodeId: string }) {
  const [state, setState] = useState<"idle" | "applying" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const apply = async () => {
    if (!nodeId || state !== "idle") return;
    setState("applying");
    try {
      let res: Response;
      if (action.type === "fee" && action.channelId) {
        res = await fetch(`/api/fees/${action.channelId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId, feeRate: action.feeRate, baseFee: action.baseFee, reason: "ai-suggestion" }),
        });
      } else if (action.type === "automation" && action.settings) {
        res = await fetch("/api/automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.settings),
        });
      } else {
        setState("error");
        setErrMsg("Ação desconhecida");
        return;
      }
      if (res.ok) {
        setState("done");
      } else {
        const d = await res.json().catch(() => ({}));
        setErrMsg(d?.error ?? `HTTP ${res.status}`);
        setState("error");
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Erro");
      setState("error");
    }
  };

  const Icon = action.type === "fee" ? Settings : Zap;

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
        style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)" }}>
        <CheckCircle size={12} /> Aplicado
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
        style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
        <XCircle size={12} /> {errMsg}
      </span>
    );
  }
  return (
    <button onClick={apply}
      disabled={!nodeId || state === "applying"}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:brightness-110 disabled:opacity-50"
      style={{ background: "rgba(139,92,246,0.18)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)", cursor: nodeId ? "pointer" : "not-allowed" }}
      title={!nodeId ? "Seleciona um nó primeiro" : undefined}>
      {state === "applying"
        ? <><Loader2 size={12} className="animate-spin" /> A aplicar…</>
        : <><Icon size={12} /> {action.label}</>}
    </button>
  );
}

const QUICK_PROMPTS = [
  "Analisa os meus canais e sugere as fees ideais",
  "Devo ativar automação? Com que configuração?",
  "Quando devo rebalancear um canal?",
  "O que é um HTLC e como afeta a minha liquidez?",
  "Porque é que alguns canais têm pouca atividade de routing?",
  "Que fee rate devo cobrar nos canais com muita liquidez local?",
];

export default function AIPage() {
  const { nodeId: activeNodeId } = useActiveNode();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config/ai")
      .then(r => r.json())
      .then(d => setHasKeys(d.hasGemini || d.hasGroq))
      .catch(() => setHasKeys(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: activeNodeId,
          message: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { text: cleanText, actions } = parseActions(data.response);
      setMessages(prev => [...prev, {
        role: "model",
        content: cleanText,
        provider: data.provider,
        actions: actions.length > 0 ? actions : undefined,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "model",
        content: err instanceof Error ? err.message : "Erro ao contactar IA",
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (hasKeys === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <Bot size={48} style={{ color: "#8b5cf6" }} />
        <h2 className="text-xl font-bold text-white">Assistente IA não configurado</h2>
        <p className="text-zinc-400 text-sm max-w-sm">
          Adiciona uma chave gratuita do Gemini ou Groq em{" "}
          <strong style={{ color: "#a78bfa" }}>Definições → Assistente IA</strong>.
        </p>
        <a href="/settings" className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "#8b5cf6" }}>
          Ir para Definições
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-w-3xl mx-auto" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "rgba(139,92,246,0.15)" }}>
            <Bot size={20} style={{ color: "#8b5cf6" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Assistente IA</h1>
            <p className="text-xs text-zinc-500">Gemini → Groq fallback · pode aplicar ações diretamente</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
            <RotateCcw size={13} /> Nova conversa
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="glass-card p-5 flex gap-3">
              <div className="p-2 rounded-full flex-shrink-0 h-fit" style={{ background: "rgba(139,92,246,0.2)" }}>
                <Bot size={16} style={{ color: "#8b5cf6" }} />
              </div>
              <div className="text-sm text-zinc-200 space-y-1">
                <p>
                  Olá! Sou o assistente IA do LightningFlow. Posso analisar os teus canais, sugerir fees ideais
                  e configurações de automação — e <strong style={{ color: "#a78bfa" }}>aplicar as mudanças diretamente</strong> com um clique.
                </p>
                {activeNodeId
                  ? <p className="text-xs text-emerald-400/80">✓ Contexto do nó carregado — análise personalizada disponível.</p>
                  : <p className="text-xs text-zinc-500">Seleciona um nó para análise personalizada e ações.</p>}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
                <Zap size={12} /> Sugestões rápidas
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PROMPTS.map(p => (
                  <button key={p} onClick={() => sendMessage(p)}
                    className="text-left text-xs p-3 rounded-lg transition-all hover:border-purple-500/40"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#a1a1aa" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={msg.role === "user"
                  ? { background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }
                  : { background: "rgba(6,182,212,0.2)", color: "#22d3ee" }}>
                {msg.role === "user" ? "Tu" : <Bot size={14} />}
              </div>
              <div className="flex flex-col gap-2 max-w-[85%]">
                <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                  style={msg.role === "user"
                    ? { background: "rgba(139,92,246,0.2)", color: "#e4e4e7", borderRadius: "18px 18px 4px 18px" }
                    : msg.error
                      ? { background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "18px 18px 18px 4px" }
                      : { background: "rgba(255,255,255,0.06)", color: "#e4e4e7", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px 18px 18px 4px" }}>
                  {msg.content}
                </div>

                {/* Ações sugeridas */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-1">
                    <span className="text-xs text-zinc-500 w-full flex items-center gap-1">
                      <Zap size={10} /> Ações sugeridas:
                    </span>
                    {msg.actions.map((action, ai) => (
                      <ActionButton key={ai} action={action} nodeId={activeNodeId} />
                    ))}
                  </div>
                )}

                {msg.provider && (
                  <span className="text-xs self-start px-2 py-0.5 rounded-full"
                    style={{
                      background: msg.provider === "gemini" ? "rgba(74,222,128,0.1)" : "rgba(251,146,60,0.1)",
                      color: msg.provider === "gemini" ? "#4ade80" : "#fb923c",
                    }}>
                    via {msg.provider === "gemini" ? "Gemini" : "Groq"}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(6,182,212,0.2)", color: "#22d3ee" }}>
              <Bot size={14} />
            </div>
            <div className="px-3 py-2 rounded-xl text-xs"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#71717a" }}>
              <span className="animate-pulse">A pensar…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); sendMessage(input); }}
        className="flex gap-2 flex-shrink-0 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Pergunta sobre canais, fees, liquidez…"
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
        <button type="submit" disabled={loading || !input.trim()}
          className="px-4 py-3 rounded-xl text-white disabled:opacity-40 transition-all"
          style={{ background: "#8b5cf6" }}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
