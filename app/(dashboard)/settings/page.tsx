"use client";

// Página de Definições — gerir nós e alterar senha

import { useEffect, useState } from "react";

interface Node {
  id: string;
  name: string;
  type: string;
  host: string;
  active: boolean;
}

export default function SettingsPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"nodes" | "security" | "ai">("nodes");

  // Node form
  const [name, setName] = useState("");
  const [type, setType] = useState<"lnd" | "cln">("lnd");
  const [host, setHost] = useState("");
  const [macaroon, setMacaroon] = useState("");
  const [cert, setCert] = useState("");
  const [rune, setRune] = useState("");
  const [adding, setAdding] = useState(false);

  // AI keys form
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [aiHints, setAiHints] = useState<{ geminiKeyHint: string | null; groqKeyHint: string | null } | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    loadNodes();
    fetch("/api/config/ai").then(r => r.json()).then(d => setAiHints(d)).catch(() => {});
  }, []);

  const loadNodes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nodes");
      const data = await res.json();
      setNodes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const addNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true); setMsg(null);
    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, type, host,
          macaroon: type === "lnd" ? macaroon : undefined,
          cert: type === "lnd" ? cert : undefined,
          rune: type === "cln" ? rune : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type: "success", text: "Nó adicionado: " + data.name });
      setName(""); setHost(""); setMacaroon(""); setCert(""); setRune("");
      await loadNodes();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Erro ao adicionar nó" });
    } finally { setAdding(false); }
  };

  const testNode = async (nodeId: string) => {
    setTesting(nodeId); setMsg(null);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/test`, { method: "POST" });
      const data = await res.json();
      setMsg(data.success
        ? { type: "success", text: "Ligação OK — " + (data.info?.alias || nodeId) }
        : { type: "error", text: "Falha: " + data.error });
    } catch { setMsg({ type: "error", text: "Erro ao testar" }); }
    finally { setTesting(null); }
  };

  const deleteNode = async (nodeId: string) => {
    if (!confirm("Tens a certeza que queres remover este nó?")) return;
    try {
      await fetch(`/api/nodes/${nodeId}`, { method: "DELETE" });
      await loadNodes();
    } catch (e) { console.error(e); }
  };

  const saveAiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true); setMsg(null);
    const body: Record<string, string> = {};
    if (geminiKey !== undefined) body.geminiApiKey = geminiKey;
    if (groqKey !== undefined) body.groqApiKey = groqKey;
    try {
      const res = await fetch("/api/config/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type: "success", text: "Chaves IA guardadas" });
      setGeminiKey(""); setGroqKey("");
      const hints = await fetch("/api/config/ai").then(r => r.json());
      setAiHints(hints);
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Erro ao guardar chaves" });
    } finally { setSavingAi(false); }
  };

  const removeAiKey = async (provider: "gemini" | "groq") => {
    setSavingAi(true); setMsg(null);
    try {
      const body = provider === "gemini" ? { geminiApiKey: "" } : { groqApiKey: "" };
      await fetch("/api/config/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setMsg({ type: "success", text: `Chave ${provider === "gemini" ? "Gemini" : "Groq"} removida` });
      const hints = await fetch("/api/config/ai").then(r => r.json());
      setAiHints(hints);
    } catch { setMsg({ type: "error", text: "Erro ao remover chave" }); }
    finally { setSavingAi(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setMsg({ type: "error", text: "As senhas não coincidem" }); return; }
    if (newPw.length < 8) { setMsg({ type: "error", text: "Nova senha deve ter pelo menos 8 caracteres" }); return; }
    setChangingPw(true); setMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type: "success", text: "Senha alterada com sucesso" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Erro ao alterar senha" });
    } finally { setChangingPw(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500";
  const inpStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Definições</h1>
        <p className="text-zinc-400 text-sm mt-1">Gerir nós Lightning e segurança da conta</p>
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
        {(["nodes", "security", "ai"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setMsg(null); }}
            className="flex-1 py-2 text-sm rounded-md transition-all font-medium"
            style={{ background: tab === t ? "#8b5cf6" : "transparent", color: tab === t ? "#fff" : "#71717a" }}>
            {t === "nodes" ? "Nós Lightning" : t === "security" ? "Segurança" : "Assistente IA"}
          </button>
        ))}
      </div>

      {/* TAB: Nós */}
      {tab === "nodes" && (
        <div className="space-y-4">
          {nodes.length > 0 && (
            <div className="glass-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Nós Configurados</h2>
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{node.type === "lnd" ? "🟡" : "🟢"}</span>
                    <div>
                      <div className="text-sm font-medium text-white">{node.name}</div>
                      <div className="text-xs text-zinc-500">{node.host}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                      {node.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => testNode(node.id)} disabled={testing === node.id}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#a1a1aa" }}>
                      {testing === node.id ? "A testar…" : "Testar"}
                    </button>
                    <button onClick={() => deleteNode(node.id)}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Adicionar Nó Lightning</h2>
            <form onSubmit={addNode} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Nome</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="ex: Meu Nó Principal" required className={inp} style={inpStyle} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Tipo</label>
                  <select value={type} onChange={(e) => setType(e.target.value as "lnd" | "cln")}
                    className={inp} style={inpStyle}>
                    <option value="lnd">LND</option>
                    <option value="cln">Core Lightning (CLN)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">
                  {type === "lnd" ? "Endereço gRPC (host:10009)" : "Endereço REST (host:3010)"}
                </label>
                <input value={host} onChange={(e) => setHost(e.target.value)}
                  placeholder={type === "lnd" ? "192.168.1.10:10009" : "192.168.1.10:3010"}
                  required className={inp} style={inpStyle} />
              </div>
              {type === "lnd" && <>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Macaroon (hex)</label>
                  <input value={macaroon} onChange={(e) => setMacaroon(e.target.value)}
                    placeholder="0201036c6e64…" className={`${inp} font-mono text-xs`} style={inpStyle} />
                  <p className="text-xs text-zinc-600">xxd -p -c 1000 ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">TLS Certificate (base64)</label>
                  <input value={cert} onChange={(e) => setCert(e.target.value)}
                    placeholder="LS0tLS1CRUdJTi…" className={`${inp} font-mono text-xs`} style={inpStyle} />
                  <p className="text-xs text-zinc-600">base64 -w0 ~/.lnd/tls.cert</p>
                </div>
              </>}
              {type === "cln" && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Rune (token CLN)</label>
                  <input value={rune} onChange={(e) => setRune(e.target.value)}
                    placeholder="S34KFhS…" className={`${inp} font-mono text-xs`} style={inpStyle} />
                  <p className="text-xs text-zinc-600">lightning-cli commando-rune</p>
                </div>
              )}
              <button type="submit" disabled={adding}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#8b5cf6" }}>
                {adding ? "A adicionar…" : "Adicionar Nó"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB: Segurança */}
      {tab === "security" && (
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Alterar Senha</h2>
            <form onSubmit={changePassword} className="space-y-3">
              {[
                { label: "Senha Atual", val: currentPw, set: setCurrentPw },
                { label: "Nova Senha", val: newPw, set: setNewPw },
                { label: "Confirmar Nova Senha", val: confirmPw, set: setConfirmPw },
              ].map(({ label, val, set }) => (
                <div key={label} className="space-y-1">
                  <label className="text-xs text-zinc-400">{label}</label>
                  <input type="password" value={val} onChange={(e) => set(e.target.value)}
                    required minLength={label === "Senha Atual" ? undefined : 8}
                    className={inp}
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid",
                      borderColor: label === "Confirmar Nova Senha" && confirmPw && confirmPw !== newPw
                        ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)",
                    }} />
                  {label === "Confirmar Nova Senha" && confirmPw && confirmPw !== newPw && (
                    <p className="text-xs text-red-400">As senhas não coincidem</p>
                  )}
                </div>
              ))}
              <button type="submit" disabled={changingPw || (!!confirmPw && confirmPw !== newPw)}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#8b5cf6" }}>
                {changingPw ? "A alterar…" : "Alterar Senha"}
              </button>
            </form>
          </div>

          <div className="glass-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Estado da Segurança</h2>
            {[
              { label: "Proteção brute force", desc: "5 tentativas / 15 min por IP" },
              { label: "Rate limiting global", desc: "100 requests / minuto por IP" },
              { label: "JWT + HttpOnly cookies", desc: "Sessão segura de 7 dias" },
              { label: "Security headers HTTP", desc: "X-Frame-Options, nosniff, HSTS" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-2.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                <div>
                  <div className="text-sm text-white">{item.label}</div>
                  <div className="text-xs text-zinc-500">{item.desc}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>Ativo</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Assistente IA */}
      {tab === "ai" && (
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Chaves de API — Assistente IA</h2>
              <p className="text-xs text-zinc-500 mt-1">Gemini e Groq são gratuitos. O Gemini tem prioridade; o Groq é usado como fallback.</p>
            </div>

            {/* Current status */}
            <div className="space-y-2">
              {[
                { name: "Gemini", hint: aiHints?.geminiKeyHint, provider: "gemini" as const, color: "#4ade80", url: "aistudio.google.com" },
                { name: "Groq", hint: aiHints?.groqKeyHint, provider: "groq" as const, color: "#fb923c", url: "console.groq.com" },
              ].map(({ name, hint, provider, color, url }) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: hint ? `rgba(74,222,128,0.1)` : "rgba(255,255,255,0.06)", color: hint ? color : "#71717a" }}>
                      {hint ? "✓ Configurado" : "Não configurado"}
                    </span>
                    <div>
                      <div className="text-sm text-white">{name}</div>
                      <div className="text-xs text-zinc-600">{hint ? `Chave: ${hint}` : url}</div>
                    </div>
                  </div>
                  {hint && (
                    <button onClick={() => removeAiKey(provider)} disabled={savingAi}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add keys form */}
            <form onSubmit={saveAiKeys} className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs text-zinc-500">Adicionar / substituir chaves (deixa vazio para não alterar)</p>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Chave Gemini</label>
                <input value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza…" className={`${inp} font-mono text-xs`} style={inpStyle} />
                <p className="text-xs text-zinc-600">Grátis em aistudio.google.com — 1.5M tokens/mês</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Chave Groq</label>
                <input value={groqKey} onChange={e => setGroqKey(e.target.value)}
                  placeholder="gsk_…" className={`${inp} font-mono text-xs`} style={inpStyle} />
                <p className="text-xs text-zinc-600">Grátis em console.groq.com — 14k req/dia (Llama 3.3 70B)</p>
              </div>
              <button type="submit" disabled={savingAi || (!geminiKey && !groqKey)}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "#8b5cf6" }}>
                {savingAi ? "A guardar…" : "Guardar Chaves"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
