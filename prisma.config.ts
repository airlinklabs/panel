import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'storage/prisma/schema.prisma',
  migrations: {
    path: 'storage/prisma/migrations',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://airlink:airlink@127.0.0.1:5432/airlink',
    // Replay DB for `migrate dev` / migration diffs — created with
    // `CREATE DATABASE airlink_shadow`. Override with SHADOW_DATABASE_URL.
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ||
      'postgresql://airlink:airlink@127.0.0.1:5432/airlink_shadow',
  },
});
