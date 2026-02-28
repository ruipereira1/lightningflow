// lib/umbrel-setup.ts
// Auto-configura o nó LND quando executado dentro do Umbrel.
// Corre uma vez no arranque via instrumentation.ts se UMBREL_LND_IP estiver definido.

import { readFileSync } from "fs";
import { existsSync } from "fs";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export async function umbrelAutoSetup(): Promise<void> {
  const lndIp = process.env.UMBREL_LND_IP;

  // Só actua dentro do Umbrel (env var injectada pelo docker-compose)
  if (!lndIp) return;

  try {
    // Verificar se já está configurado — nunca sobrescrever configuração existente
    const existing = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    if (existing) return;

    const macaroonPath = process.env.UMBREL_MACAROON_PATH
      ?? "/lnd/data/chain/bitcoin/mainnet/admin.macaroon";
    const certPath    = process.env.UMBREL_CERT_PATH ?? "/lnd/tls.cert";
    const grpcPort    = process.env.UMBREL_LND_GRPC_PORT ?? "10009";
    const password    = process.env.UMBREL_PASSWORD;
    const network     = process.env.UMBREL_BITCOIN_NETWORK ?? "mainnet";

    if (!password) {
      console.warn("[LightningFlow] UMBREL_PASSWORD não definido — setup automático ignorado");
      return;
    }

    // Verificar se os ficheiros do LND estão acessíveis
    if (!existsSync(macaroonPath)) {
      console.warn(`[LightningFlow] Macaroon não encontrado em ${macaroonPath} — a aguardar LND`);
      return;
    }
    if (!existsSync(certPath)) {
      console.warn(`[LightningFlow] TLS cert não encontrado em ${certPath}`);
      return;
    }

    console.log(`[LightningFlow] Umbrel detectado — a configurar LND ${lndIp}:${grpcPort} (${network})...`);

    // Ler credenciais do LND
    const macaroonHex = readFileSync(macaroonPath).toString("hex");
    const certBase64  = readFileSync(certPath).toString("base64");

    // Criar AppConfig com a password do Umbrel
    const passwordHash  = await bcrypt.hash(password, 12);
    const sessionSecret = process.env.SESSION_SECRET ?? "";

    await prisma.appConfig.create({
      data: { passwordHash, sessionSecret },
    });

    // Criar o nó LND automaticamente
    await prisma.node.create({
      data: {
        name:     "Umbrel LND",
        type:     "lnd",
        host:     `${lndIp}:${grpcPort}`,
        macaroon: macaroonHex,
        cert:     certBase64,
      },
    });

    console.log("[LightningFlow] Auto-setup Umbrel concluído com sucesso!");
  } catch (err) {
    // Não bloquear o arranque da app em caso de erro
    console.error("[LightningFlow] Erro no auto-setup Umbrel:", err);
  }
}
