import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "storage/prisma/schema.prisma",
  migrations: {
    path: "storage/prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
