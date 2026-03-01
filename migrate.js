#!/usr/bin/env node
// migrate.js — aplica migrações SQL sem precisar do Prisma CLI
// Usa @libsql/client directamente (já incluído no standalone build)

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL ?? "file:/app/data/lightningflow.db";
console.log("[migrate] DB:", dbUrl);

const db = createClient({ url: dbUrl });

// Criar tabela de controlo de migrações (equivalente ao _prisma_migrations)
await db.execute(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    finished_at DATETIME,
    migration_name TEXT NOT NULL UNIQUE,
    logs TEXT,
    rolled_back_at DATETIME,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  )
`);

// Ler migrações da pasta prisma/migrations
const migrationsDir = join(__dirname, "prisma", "migrations");
if (!existsSync(migrationsDir)) {
  console.log("[migrate] Pasta de migrações não encontrada, ignorando.");
  process.exit(0);
}

const folders = readdirSync(migrationsDir)
  .filter((f) => !f.endsWith(".toml"))
  .sort();

let applied = 0;
let skipped = 0;

for (const folder of folders) {
  const sqlPath = join(migrationsDir, folder, "migration.sql");
  if (!existsSync(sqlPath)) continue;

  // Verificar se já foi aplicada
  const existing = await db.execute({
    sql: "SELECT id FROM _prisma_migrations WHERE migration_name = ?",
    args: [folder],
  });

  if (existing.rows.length > 0) {
    skipped++;
    continue;
  }

  // Aplicar migração
  const sql = readFileSync(sqlPath, "utf-8");
  console.log(`[migrate] Aplicar: ${folder}`);

  try {
    // Executar cada statement separadamente
    // Remover comentários SQL (linhas que começam com --) antes de filtrar
    const statements = sql
      .split(";")
      .map((s) => {
        // Remover linhas de comentário do início do statement
        return s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim();
      })
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      if (stmt) await db.execute(stmt + ";");
    }

    // Registar migração como aplicada
    await db.execute({
      sql: "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, datetime('now'), 1)",
      args: [folder, folder, folder],
    });

    applied++;
  } catch (err) {
    console.error(`[migrate] ERRO em ${folder}:`, err.message);
    process.exit(1);
  }
}

console.log(
  `[migrate] Concluído: ${applied} aplicadas, ${skipped} já existentes.`
);
db.close();
