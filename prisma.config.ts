import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "storage/prisma/schema.prisma",
  migrations: {
    path: "storage/prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://airlink:airlink@127.0.0.1:5432/airlink",
  },
});
