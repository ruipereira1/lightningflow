import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // ln-service usa __dirname para encontrar os proto files gRPC.
  // Se for bundled pelo Next.js, o __dirname fica errado (C:\ROOT).
  // Marcar como externo força o require() nativo em runtime.
  serverExternalPackages: ["ln-service", "lightning", "@grpc/grpc-js", "@grpc/proto-loader", "groq-sdk", "@google/generative-ai"],

  // Headers de segurança HTTP adicionados a todas as respostas
  // (complementam os headers do middleware proxy.ts)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://amboss.space wss:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
