// Hook de startup do Next.js — corre uma vez quando o servidor arranca
// Inicializa o scheduler de automação e faz auto-setup quando no Umbrel

export async function register() {
  // Só correr no runtime Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Auto-configurar LND se correr dentro do Umbrel
    const { umbrelAutoSetup } = await import("./lib/umbrel-setup");
    await umbrelAutoSetup();

    const { scheduler } = await import("./lib/scheduler");
    scheduler.start();
    console.log("[LightningFlow] Scheduler de automação iniciado");
  }
}
