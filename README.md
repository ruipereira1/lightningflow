<div align="center">

# ⚡ LightningFlow

**Dashboard profissional para gestão de nós Lightning Network**

[![Docker Hub](https://img.shields.io/docker/v/ruipereira1/lightningflow?label=Docker%20Hub&logo=docker&color=0db7ed)](https://hub.docker.com/r/ruipereira1/lightningflow)
[![Docker Pulls](https://img.shields.io/docker/pulls/ruipereira1/lightningflow?color=0db7ed&logo=docker)](https://hub.docker.com/r/ruipereira1/lightningflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)

Self-hosted · Open-source · LND + CLN · Umbrel ready

</div>

---

## O que é?

LightningFlow é um dashboard moderno para gerir o teu nó Lightning Network. Conecta automaticamente ao teu nó (LND ou Core Lightning), sem configuração manual.

**Funciona no Umbrel, RaspiBlitz, Start9 ou em qualquer servidor com Docker.**

---

## Funcionalidades

### Dashboard em tempo real
- Saldo on-chain e Lightning com conversão automática para EUR
- Canais ativos, peers conectados, updates via SSE (live)
- Notificações in-app para eventos importantes

### Gestão de Canais
- Lista completa com liquidez local/remota e estado
- Página de detalhe por canal — capacidade, ROI, histórico de fees
- Fechar canais (cooperativo ou forçado) diretamente na interface

### Fee Optimizer
- Sugestão automática de fees baseada em liquidez do canal
- Considera as fees do peer remoto para sugestões mais inteligentes
- Aplicar a todos os canais com um clique
- Edição manual por canal com valores em tempo real

### Histórico de Fees
- Timeline de todas as alterações de fee (automáticas e manuais)
- Gráfico de evolução por canal
- Filtro por canal, métricas de variação média

### Analytics
- Ganhos diários nos últimos 30 dias
- ROI anualizado por canal
- Deteção de canais mortos (sem forwards há 7+ dias)
- Exportação CSV para Excel/Numbers
- Conversão em EUR em tempo real

### Automação
- **Auto-fees** — ajusta fees automaticamente a cada ciclo
- **Auto-rebalancing** — move liquidez sem prejuízo (fee < ganho esperado)
- **Auto-peer connect** — liga-se a peers de alta qualidade automaticamente
- Configuração de intervalos, thresholds e limites
- Log de atividade com cada ação tomada

### Rebalancing
- Interface para mover liquidez entre canais
- Sugestões automáticas: canais com excesso vs. canais com falta
- Histórico de jobs com estado e fees pagas

### Peers
- Lista de peers conectados com tráfego (bytes enviados/recebidos)
- Conectar novos peers manualmente ou via lista de top peers recomendados
- Link direto para Amboss por peer

### Segurança
- Autenticação JWT com cookies HttpOnly
- Proteção contra brute-force (rate limiting)
- Reset de emergência via secret
- Sem dados enviados para servidores externos

---

## Instalar

> Precisas apenas do **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** instalado.

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/ruipereira1/lightningflow/main/install.sh | bash
```

Ou se já tens o repositório clonado:
```bash
bash install.sh
```

### Windows

Clica duas vezes em **`INSTALAR.bat`**

### Umbrel

Disponível no **Umbrel App Store** — instala com um clique, liga automaticamente ao teu nó LND.

---

Depois de instalar, abre **[http://localhost:3000](http://localhost:3000)** no browser.
Na primeira vez, cria a tua password de acesso.

---

## Docker (manual)

```bash
# Puxar e correr
docker run -d \
  -p 3000:3000 \
  -v lightningflow_data:/app/data \
  -e SESSION_SECRET=muda-este-segredo \
  ruipereira1/lightningflow:latest
```

Ou com `docker compose`:

```bash
git clone https://github.com/ruipereira1/lightningflow
cd lightningflow
cp .env.example .env   # edita com os teus valores
docker compose up -d
```

---

## Conectar ao teu nó

### LND

1. Vai a **Definições → Adicionar Nó → LND**
2. Endereço gRPC: `IP_DO_NO:10009`
3. Admin Macaroon (hex):
   ```bash
   xxd -p -c 1000 ~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
   ```
4. TLS Certificate (base64):
   ```bash
   base64 -w0 ~/.lnd/tls.cert
   ```

### Core Lightning (CLN)

1. Vai a **Definições → Adicionar Nó → CLN**
2. Cria uma rune de acesso:
   ```bash
   lightning-cli commando-rune
   ```
3. Endereço REST: `IP_DO_NO:3010`

### Umbrel (automático)

No Umbrel, a configuração é automática. A password inicial é a tua password do Umbrel.

---

## Stack técnica

| Componente | Tecnologia |
|---|---|
| Frontend | Next.js 16, React, TailwindCSS, shadcn/ui |
| Backend | Next.js API Routes (Node.js) |
| Base de dados | SQLite via Prisma 7 + libSQL |
| Lightning | ln-service (LND gRPC) + CLN REST |
| Auth | JWT (jose) com cookies HttpOnly |
| Deploy | Docker multi-arch (amd64 + arm64) |

---

## Desenvolvimento local

```bash
git clone https://github.com/ruipereira1/lightningflow
cd lightningflow
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Comandos úteis

```bash
# Logs em tempo real
docker compose logs -f

# Parar
docker compose stop

# Reiniciar
docker compose restart

# Atualizar para a versão mais recente
docker compose pull && docker compose up -d
```

---

## Reset de emergência

Se perderes o acesso:

```
http://localhost:3000/api/auth/reset?secret=SEU_RESET_SECRET
```

O `RESET_SECRET` está no ficheiro `.env` criado durante a instalação.

---

## Compatível com

- **LND** (Lightning Network Daemon)
- **Core Lightning** (CLN / c-lightning)
- **Umbrel** — App Store oficial
- **RaspiBlitz**, **Start9**, **myNode**
- Qualquer Linux/macOS/Windows com Docker

---

## Contribuir

Pull requests são bem-vindos. Para mudanças grandes, abre uma issue primeiro.

```bash
git checkout -b feature/nova-funcionalidade
# faz as tuas mudanças
git commit -m "feat: nova funcionalidade"
git push origin feature/nova-funcionalidade
```

---

## Licença

[MIT](LICENSE) — livre para usar, modificar e distribuir.

---

<div align="center">
Feito com ⚡ por <a href="https://github.com/ruipereira1">ruipereira1</a>
</div>
