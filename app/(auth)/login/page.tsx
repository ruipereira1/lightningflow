// Página de Login — dark premium
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((data) => setIsSetup(!data.configured));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao fazer login"); return; }
      router.push("/");
      router.refresh();
    } catch { setError("Erro de rede. Verifica a ligação."); }
    finally { setLoading(false); }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError("As senhas não coincidem"); return; }
    if (newPassword.length < 8) { setError("A senha deve ter pelo menos 8 caracteres"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro no setup"); return; }
      setIsSetup(false);
    } catch { setError("Erro de rede."); }
    finally { setLoading(false); }
  };

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all duration-150";
  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
  };
  const inputFocusStyle = { boxShadow: "0 0 0 3px rgba(139,92,246,0.2)", borderColor: "rgba(139,92,246,0.6)" };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "#09090b",
        backgroundImage: [
          "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(139,92,246,0.12) 0%, transparent 55%)",
          "radial-gradient(ellipse 60% 50% at 80% 90%, rgba(6,182,212,0.08) 0%, transparent 55%)",
        ].join(", "),
      }}
    >
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #0891b2)",
              boxShadow: "0 0 40px rgba(139,92,246,0.4), 0 4px 12px rgba(0,0,0,0.4)",
            }}>
            <span className="text-2xl">⚡</span>
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #c4b5fd, #67e8f9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            LightningFlow
          </h1>
          <p className="text-sm mt-1" style={{ color: "#52525b" }}>
            {isSetup === null ? "" : isSetup ? "Configura o teu acesso" : "Gestão de canais Lightning"}
          </p>
        </div>

        {/* Card */}
        <div
          className="p-6 rounded-2xl space-y-5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div>
            <h2 className="text-base font-semibold text-white">
              {isSetup ? "Configuração Inicial" : "Entrar"}
            </h2>
            <p className="text-xs mt-1" style={{ color: "#71717a" }}>
              {isSetup
                ? "Define a senha de acesso à tua instância"
                : "Introduz a tua senha de acesso"}
            </p>
          </div>

          {isSetup ? (
            <form onSubmit={handleSetup} className="space-y-4">
              <FocusInput
                type="password"
                value={newPassword}
                onChange={(v) => setNewPassword(v)}
                placeholder="Nova senha (mín. 8 caracteres)"
                cls={inputCls}
                style={inputStyle}
                focusStyle={inputFocusStyle}
              />
              <FocusInput
                type="password"
                value={confirmPassword}
                onChange={(v) => setConfirmPassword(v)}
                placeholder="Confirmar senha"
                cls={inputCls}
                style={{
                  ...inputStyle,
                  ...(confirmPassword && confirmPassword !== newPassword
                    ? { borderColor: "rgba(239,68,68,0.5)" }
                    : {}),
                }}
                focusStyle={inputFocusStyle}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-400 -mt-2">As senhas não coincidem</p>
              )}
              {error && <ErrorBox msg={error} />}
              <SubmitBtn loading={loading} label="Configurar App" loadingLabel="A configurar..." />
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <FocusInput
                type="password"
                value={password}
                onChange={(v) => setPassword(v)}
                placeholder="A tua senha de acesso"
                autoFocus
                cls={inputCls}
                style={inputStyle}
                focusStyle={inputFocusStyle}
              />
              {error && <ErrorBox msg={error} />}
              <SubmitBtn loading={loading} label="Entrar" loadingLabel="A entrar..." />
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#3f3f46" }}>
          LightningFlow — Open Source Lightning Channel Manager
        </p>
      </div>
    </div>
  );
}

/* Helpers */
function FocusInput({
  type, value, onChange, placeholder, autoFocus, cls, style, focusStyle,
}: {
  type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; autoFocus?: boolean;
  cls: string; style: React.CSSProperties; focusStyle: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      required
      className={cls}
      style={{ ...style, ...(focused ? focusStyle : {}) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-3 rounded-xl text-sm"
      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
      {msg}
    </div>
  );
}

function SubmitBtn({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50"
      style={{
        background: loading
          ? "rgba(139,92,246,0.5)"
          : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
        boxShadow: loading ? "none" : "0 4px 16px rgba(139,92,246,0.35)",
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
