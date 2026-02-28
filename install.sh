#!/bin/bash
# LightningFlow — Instalador (Linux / macOS)
set -e

echo ""
echo "  LightningFlow — Instalador"
echo "  ==========================="
echo ""

# Verificar Docker
command -v docker &>/dev/null || { echo "  ERRO: Instala o Docker primeiro."; echo "  https://docs.docker.com/engine/install/"; exit 1; }
docker compose version &>/dev/null || { echo "  ERRO: Docker Compose não encontrado."; exit 1; }

# Criar .env com segredos gerados automaticamente
if [ ! -f .env ]; then
  cat > .env <<EOF
DATABASE_URL="file:./data/lightningflow.db"
SESSION_SECRET="$(openssl rand -hex 32)"
RESET_SECRET="$(openssl rand -hex 32)"
PORT=3000
NODE_ENV=production
EOF
  echo "  Configuracao criada."
fi

# Pasta de dados
mkdir -p data/data

# Iniciar
echo "  A iniciar... (pode demorar 2-3 minutos)"
docker compose up -d --build

echo ""
echo "  Pronto! Abre: http://localhost:3000"
echo ""
