"use client";

// Página de Pagamentos — criar invoices (receber) e pagar invoices (enviar)

import { useEffect, useState, useCallback } from "react";
import { useActiveNode } from "@/components/node-selector";
import { useBtcPrice, satsToEur } from "@/lib/use-btc-price";
import QRCode from "qrcode";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  CheckCheck,
  Zap,
  RefreshCw,
  Send,
} from "lucide-react";

interface InvoiceRecord {
  id: string;
  rHash: string;
  paymentRequest: string;
  amountSat: string;
  memo: string | null;
  status: string;
  settledAt: string | null;
  createdAt: string;
}

interface PaymentRecord {
  id: string;
  paymentRequest: string;
  amountSat: string;
  feeSat: string;
  preimage: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

function truncateBolt11(pr: string, chars = 24) {
  if (pr.length <= chars * 2) return pr;
  return `${pr.slice(0, chars)}...${pr.slice(-chars)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function PaymentsPage() {
  const { nodeId } = useActiveNode();
  const btcPrice = useBtcPrice();

  // ── Receber ──────────────────────────────────────────────────────────────
  const [recvAmount, setRecvAmount] = useState("");
  const [recvMemo, setRecvMemo] = useState("");
  const [recvLoading, setRecvLoading] = useState(false);
  const [recvError, setRecvError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ paymentRequest: string; amountSat: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Enviar ───────────────────────────────────────────────────────────────
  const [sendBolt11, setSendBolt11] = useState("");
  const [sendMaxFee, setSendMaxFee] = useState("500");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ feeSat: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── Histórico ────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!nodeId) return;
    setHistLoading(true);
    const [invRes, payRes] = await Promise.all([
      fetch(`/api/invoices?nodeId=${nodeId}&limit=50`).catch(() => null),
      fetch(`/api/payments?nodeId=${nodeId}&limit=50`).catch(() => null),
    ]);
    if (invRes?.ok) setInvoices(await invRes.json());
    if (payRes?.ok) setPayments(await payRes.json());
    setHistLoading(false);
  }, [nodeId]);

  useEffect(() => {
    if (nodeId) loadHistory();
  }, [nodeId, loadHistory]);

  // ── Criar invoice ─────────────────────────────────────────────────────────
  async function handleCreateInvoice() {
    if (!nodeId || !recvAmount) return;
    setRecvLoading(true);
    setRecvError(null);
    setCreatedInvoice(null);
    setQrDataUrl(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, amountSat: Number(recvAmount), memo: recvMemo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setRecvError(data.error ?? "Erro ao criar invoice"); return; }
      setCreatedInvoice({ paymentRequest: data.paymentRequest, amountSat: data.amountSat });
      // Gerar QR code
      const qr = await QRCode.toDataURL(data.paymentRequest.toUpperCase(), { width: 240, margin: 1 });
      setQrDataUrl(qr);
      await loadHistory();
    } catch {
      setRecvError("Erro de rede");
    } finally {
      setRecvLoading(false);
    }
  }

  function handleCopy() {
    if (!createdInvoice) return;
    navigator.clipboard.writeText(createdInvoice.paymentRequest).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleResetInvoice() {
    setCreatedInvoice(null);
    setQrDataUrl(null);
    setRecvAmount("");
    setRecvMemo("");
    setRecvError(null);
  }

  // ── Pagar invoice ─────────────────────────────────────────────────────────
  async function handleSendPayment() {
    if (!nodeId || !sendBolt11.trim()) return;
    setSendLoading(true);
    setSendError(null);
    setSendResult(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          paymentRequest: sendBolt11.trim(),
          maxFeePpm: Number(sendMaxFee),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSendError(data.error ?? "Erro ao pagar invoice"); return; }
      setSendResult({ feeSat: data.feeSat });
      setSendBolt11("");
      await loadHistory();
    } catch {
      setSendError("Erro de rede");
    } finally {
      setSendLoading(false);
    }
  }

  const inputStyle = {
    background: "rgba(39,39,42,0.6)",
    border: "1px solid rgba(63,63,70,0.8)",
    borderRadius: 8,
    color: "#e4e4e7",
    padding: "8px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
  };

  const cardStyle = {
    background: "rgba(24,24,27,0.7)",
    border: "1px solid rgba(63,63,70,0.5)",
    borderRadius: 12,
    padding: 20,
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: 0 }}>Pagamentos</h1>
          <p style={{ color: "#71717a", fontSize: 13, margin: "4px 0 0" }}>Criar invoices para receber e pagar invoices Lightning</p>
        </div>
        <button
          onClick={loadHistory}
          disabled={histLoading}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(39,39,42,0.8)", border: "1px solid rgba(63,63,70,0.6)", borderRadius: 8, color: "#a1a1aa", padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
        >
          <RefreshCw size={14} style={{ animation: histLoading ? "spin 1s linear infinite" : "none" }} />
          Atualizar
        </button>
      </div>

      {!nodeId && (
        <div style={{ ...cardStyle, textAlign: "center", color: "#71717a", padding: 40 }}>
          Seleciona um nó no topo da página para gerir pagamentos.
        </div>
      )}

      {nodeId && (
        <>
          {/* Receber + Enviar lado a lado */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

            {/* ── Receber ── */}
            <div style={{ ...cardStyle, borderTop: "2px solid #8b5cf6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <ArrowDownLeft size={18} style={{ color: "#8b5cf6" }} />
                <span style={{ fontWeight: 600, color: "#c4b5fd", fontSize: 15 }}>Receber</span>
              </div>

              {!createdInvoice ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: "#a1a1aa", fontSize: 12, display: "block", marginBottom: 4 }}>Valor (sats)</label>
                    <input
                      type="number"
                      min={1}
                      value={recvAmount}
                      onChange={(e) => setRecvAmount(e.target.value)}
                      placeholder="ex: 10000"
                      style={inputStyle}
                    />
                    {recvAmount && btcPrice && (
                      <div style={{ color: "#52525b", fontSize: 11, marginTop: 3 }}>
                        {satsToEur(Number(recvAmount), btcPrice)}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: "#a1a1aa", fontSize: 12, display: "block", marginBottom: 4 }}>Descrição (opcional)</label>
                    <input
                      type="text"
                      value={recvMemo}
                      onChange={(e) => setRecvMemo(e.target.value)}
                      placeholder="ex: Pagamento de serviço"
                      style={inputStyle}
                    />
                  </div>
                  {recvError && <p style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{recvError}</p>}
                  <button
                    onClick={handleCreateInvoice}
                    disabled={recvLoading || !recvAmount}
                    style={{
                      width: "100%", padding: "9px 0", borderRadius: 8, border: "none", cursor: recvLoading || !recvAmount ? "not-allowed" : "pointer",
                      background: recvLoading || !recvAmount ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.85)",
                      color: "#fff", fontWeight: 600, fontSize: 14,
                    }}
                  >
                    {recvLoading ? "A criar..." : "Criar Invoice"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    {qrDataUrl && (
                      <img src={qrDataUrl} alt="QR Invoice" style={{ borderRadius: 8, border: "2px solid rgba(139,92,246,0.4)", maxWidth: 220 }} />
                    )}
                  </div>
                  <div style={{ background: "rgba(39,39,42,0.6)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, wordBreak: "break-all", fontSize: 10, color: "#71717a", fontFamily: "monospace" }}>
                    {createdInvoice.paymentRequest}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleCopy}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.1)", color: "#c4b5fd", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      {copied ? <><CheckCheck size={14} /> Copiado!</> : <><Copy size={14} /> Copiar BOLT11</>}
                    </button>
                    <button
                      onClick={handleResetInvoice}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(63,63,70,0.6)", background: "rgba(39,39,42,0.6)", color: "#a1a1aa", fontSize: 13, cursor: "pointer" }}
                    >
                      Nova
                    </button>
                  </div>
                  <div style={{ marginTop: 10, textAlign: "center", color: "#a1a1aa", fontSize: 12 }}>
                    <Zap size={12} style={{ display: "inline", color: "#8b5cf6" }} /> {Number(createdInvoice.amountSat).toLocaleString("pt-PT")} sats {btcPrice ? `· ${satsToEur(Number(createdInvoice.amountSat), btcPrice)}` : ""}
                  </div>
                </>
              )}
            </div>

            {/* ── Enviar ── */}
            <div style={{ ...cardStyle, borderTop: "2px solid #06b6d4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <ArrowUpRight size={18} style={{ color: "#06b6d4" }} />
                <span style={{ fontWeight: 600, color: "#67e8f9", fontSize: 15 }}>Enviar</span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ color: "#a1a1aa", fontSize: 12, display: "block", marginBottom: 4 }}>Invoice BOLT11</label>
                <textarea
                  value={sendBolt11}
                  onChange={(e) => { setSendBolt11(e.target.value); setSendResult(null); setSendError(null); }}
                  placeholder="lnbc..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: "#a1a1aa", fontSize: 12, display: "block", marginBottom: 4 }}>Fee máxima (ppm)</label>
                <input
                  type="number"
                  min={1}
                  value={sendMaxFee}
                  onChange={(e) => setSendMaxFee(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {sendResult && (
                <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCheck size={16} style={{ color: "#10b981" }} />
                  <span style={{ color: "#6ee7b7", fontSize: 13 }}>
                    Pago! Fee: {sendResult.feeSat} sats
                    {btcPrice && Number(sendResult.feeSat) > 0 ? ` · ${satsToEur(Number(sendResult.feeSat), btcPrice)}` : ""}
                  </span>
                </div>
              )}
              {sendError && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                  <p style={{ color: "#fca5a5", fontSize: 12, margin: 0 }}>{sendError}</p>
                </div>
              )}

              <button
                onClick={handleSendPayment}
                disabled={sendLoading || !sendBolt11.trim()}
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 8, border: "none",
                  cursor: sendLoading || !sendBolt11.trim() ? "not-allowed" : "pointer",
                  background: sendLoading || !sendBolt11.trim() ? "rgba(6,182,212,0.3)" : "rgba(6,182,212,0.8)",
                  color: "#fff", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Send size={15} />
                {sendLoading ? "A pagar..." : "Pagar Invoice"}
              </button>
            </div>
          </div>

          {/* ── Histórico ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Faturas criadas */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#c4b5fd", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <ArrowDownLeft size={14} /> Faturas criadas ({invoices.length})
              </h3>
              {invoices.length === 0 ? (
                <p style={{ color: "#52525b", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhuma fatura criada ainda</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {invoices.map((inv) => (
                    <div key={inv.id} style={{ background: "rgba(39,39,42,0.5)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "#d4d4d8", fontSize: 13, fontWeight: 500 }}>
                          {Number(inv.amountSat).toLocaleString("pt-PT")} sats
                          {btcPrice ? <span style={{ color: "#52525b", fontSize: 11 }}> · {satsToEur(Number(inv.amountSat), btcPrice)}</span> : ""}
                        </div>
                        {inv.memo && <div style={{ color: "#71717a", fontSize: 11 }}>{inv.memo}</div>}
                        <div style={{ color: "#52525b", fontSize: 11 }}>{formatDate(inv.createdAt)}</div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: inv.status === "settled" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                        color: inv.status === "settled" ? "#6ee7b7" : "#fcd34d",
                      }}>
                        {inv.status === "settled" ? "Pago" : "Pendente"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagamentos enviados */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#67e8f9", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <ArrowUpRight size={14} /> Pagamentos enviados ({payments.length})
              </h3>
              {payments.length === 0 ? (
                <p style={{ color: "#52525b", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhum pagamento enviado ainda</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {payments.map((pay) => (
                    <div key={pay.id} style={{ background: "rgba(39,39,42,0.5)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "#d4d4d8", fontSize: 13, fontWeight: 500 }}>
                          {Number(pay.amountSat).toLocaleString("pt-PT")} sats
                          {btcPrice && Number(pay.amountSat) > 0 ? <span style={{ color: "#52525b", fontSize: 11 }}> · {satsToEur(Number(pay.amountSat), btcPrice)}</span> : ""}
                        </div>
                        {pay.status === "success" && Number(pay.feeSat) > 0 && (
                          <div style={{ color: "#71717a", fontSize: 11 }}>Fee: {pay.feeSat} sats</div>
                        )}
                        {pay.error && <div style={{ color: "#f87171", fontSize: 11 }}>{pay.error}</div>}
                        <div style={{ color: "#52525b", fontSize: 11 }}>
                          {truncateBolt11(pay.paymentRequest, 12)} · {formatDate(pay.createdAt)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: pay.status === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                        color: pay.status === "success" ? "#6ee7b7" : "#fca5a5",
                      }}>
                        {pay.status === "success" ? "Enviado" : "Falhou"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        input::placeholder, textarea::placeholder { color: #52525b; }
        input:focus, textarea:focus { border-color: rgba(139,92,246,0.5) !important; box-shadow: 0 0 0 2px rgba(139,92,246,0.1); }
      `}</style>
    </div>
  );
}
