import "dotenv/config";
import { defineConfig } from "prisma/config";

const dbPath = process.env["DATABASE_URL"] ?? "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbPath,
  },
});
