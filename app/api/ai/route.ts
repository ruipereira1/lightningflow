// API: Assistente de IA Lightning
// POST /api/ai — chat com contexto do nó (Gemini 2.0 Flash → Groq Llama 3.3 fallback)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// ── Rate limiter em memória: max 20 req por IP por 5 minutos ──────────────────
const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const RATE_MAX = 20;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return false;
  hits.push(now);
  rateLimitMap.set(ip, hits);
  // Limpar IPs antigos ocasionalmente
  if (rateLimitMap.size > 500) {
    for (const [k, v] of rateLimitMap) {
      if (v.every(t => now - t >= RATE_WINDOW_MS)) rateLimitMap.delete(k);
    }
  }
  return true;
}

// ── Sanitizar strings externas antes de injetar no system prompt ─────────────
// Impede prompt injection via aliases de peers ou nomes de nós
function sanitizeForPrompt(s: string, maxLen = 40): string {
  return s
    .replace(/%%/g, "[%][%]")          // bloquear blocos %%ACTIONS%%
    .replace(/[^\x20-\x7E\u00C0-\u024F]/g, "")  // só ASCII printável + Latin
    .replace(/[`"\\]/g, "")            // remover aspas e backslashes
    .trim()
    .slice(0, maxLen);
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

async function buildNodeContext(nodeId: string): Promise<string> {
  try {
    const [node, automationCfg] = await Promise.all([
      prisma.node.findUnique({ where: { id: nodeId } }),
      prisma.appConfig.findUnique({
        where: { id: "singleton" },
        select: { autoFeeEnabled: true, autoRebalanceEnabled: true, autoPeerEnabled: true, automationInterval: true },
      }),
    ]);
    if (!node) return "";

    const [channels, recentForwards] = await Promise.all([
      prisma.channel.findMany({ where: { nodeId }, orderBy: { capacity: "desc" }, take: 10 }),
      prisma.forwardingEvent.findMany({
        where: { nodeId, timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        take: 100,
      }),
    ]);

    const totalLocal = channels.reduce((s, c) => s + Number(c.localBalance), 0);
    const totalRemote = channels.reduce((s, c) => s + Number(c.remoteBalance), 0);
    const totalFees = recentForwards.reduce((s, e) => s + Number(e.fee), 0);

    const channelLines = channels.map((c) => {
      const total = Number(c.localBalance) + Number(c.remoteBalance) || 1;
      const ratio = (Number(c.localBalance) / total * 100).toFixed(0);
      // Sanitizar alias: um peer malicioso pode definir um alias com %%ACTIONS%% ou instruções
      const rawAlias = c.remoteAlias ?? c.remotePubkey.slice(0, 12);
      const alias = sanitizeForPrompt(rawAlias, 30);
      return `  - id=${c.id} peer=${alias} cap=${(Number(c.capacity) / 1e8).toFixed(4)}BTC local=${ratio}% feeRate=${c.localFeeRate}ppm baseFee=${c.baseFee}msat active=${c.active}`;
    }).join("\n");

    const autoLine = automationCfg
      ? `\n- Automation: autoFees=${automationCfg.autoFeeEnabled} autoRebalance=${automationCfg.autoRebalanceEnabled} interval=${automationCfg.automationInterval}min`
      : "";

    const safeName = sanitizeForPrompt(node.name, 50);
    return `\nNode context "${safeName}" (${node.type.toUpperCase()}):
- Channels: ${channels.filter(c => c.active).length} active / ${channels.length} total
- Local liquidity: ${(totalLocal / 1e8).toFixed(4)} BTC | remote: ${(totalRemote / 1e8).toFixed(4)} BTC
- Forwarding 7 days: ${recentForwards.length} events, ${(totalFees / 1000).toFixed(0)} sats in fees${autoLine}
- Channels (use these exact IDs in actions):
${channelLines}`;
  } catch {
    return "";
  }
}

async function callGemini(apiKey: string, system: string, history: ChatMessage[], message: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: system,
  });
  const chat = model.startChat({
    history: history.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
  });
  return (await chat.sendMessage(message)).response.text();
}

async function callGroq(apiKey: string, system: string, history: ChatMessage[], message: string): Promise<string> {
  const Groq = (await import("groq-sdk")).default;
  const completion = await new Groq({ apiKey }).chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    messages: [
      { role: "system", content: system },
      ...history.map(m => ({ role: m.role === "model" ? "assistant" as const : "user" as const, content: m.content })),
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content ?? "No response";
}

export async function POST(request: NextRequest) {
  // Rate limiting por IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait 5 minutes before trying again." },
      { status: 429 }
    );
  }

  let body: { nodeId?: string; message?: string; history?: ChatMessage[] } = {};
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { nodeId, message, history = [] } = body;
  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  // Limites de tamanho: impede esgotamento de tokens da API
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message too long (max. 2000 characters)" }, { status: 400 });
  }
  if (!Array.isArray(history) || history.length > 50) {
    return NextResponse.json({ error: "Invalid or too long history" }, { status: 400 });
  }
  // Validar estrutura do histórico (previne manipulação de roles)
  for (const msg of history) {
    if (msg.role !== "user" && msg.role !== "model") {
      return NextResponse.json({ error: "Invalid role in history" }, { status: 400 });
    }
    if (typeof msg.content !== "string" || msg.content.length > 4000) {
      return NextResponse.json({ error: "Invalid content in history" }, { status: 400 });
    }
  }

  const config = await prisma.appConfig.findUnique({
    where: { id: "singleton" },
    select: { geminiApiKey: true, groqApiKey: true },
  });

  if (!config?.geminiApiKey && !config?.groqApiKey) {
    return NextResponse.json(
      { error: "No AI key configured. Go to Settings → AI Assistant." },
      { status: 400 }
    );
  }

  const nodeContext = nodeId ? await buildNodeContext(nodeId) : "";
  const system = `You are a specialized assistant for Lightning Network node management integrated into the LightningFlow app.
You help operators manage channels, optimize fees, improve liquidity, and interpret metrics.
Always respond in English. Be concise, practical, and technical when needed.
When suggesting actions, briefly explain the reason.

APPLICABLE ACTIONS: When suggesting concrete fee changes or automation settings, include an action block AT THE END of your response (after the explanatory text), in this exact format:
%%ACTIONS%%[{"type":"fee","channelId":"ID_EXACTO","feeRate":NUMERO,"baseFee":NUMERO,"label":"Descrição curta da ação"},{"type":"automation","settings":{"autoFeeEnabled":true,"automationInterval":30},"label":"Ativar auto-fees a cada 30min"}]%%END%%

Rules:
- ALWAYS use the real channel IDs from the context (field id=... in each channel)
- feeRate in ppm (e.g. 150), baseFee in msat (e.g. 1000)
- You can combine multiple types in a single JSON array
- Only include the block when there are concrete actions to apply — NEVER in general explanations${nodeContext}`;

  const providers: Array<{ name: string; fn: () => Promise<string> }> = [];
  if (config.geminiApiKey) providers.push({ name: "gemini", fn: () => callGemini(config.geminiApiKey!, system, history, message) });
  if (config.groqApiKey)   providers.push({ name: "groq",   fn: () => callGroq(config.groqApiKey!, system, history, message) });

  for (const provider of providers) {
    try {
      const response = await provider.fn();
      return NextResponse.json({ response, provider: provider.name });
    } catch (err) {
      console.warn(`[AI] ${provider.name} falhou: ${err instanceof Error ? err.message : err}`);
    }
  }

  return NextResponse.json({ error: "Both providers failed. Check your API keys." }, { status: 502 });
}
