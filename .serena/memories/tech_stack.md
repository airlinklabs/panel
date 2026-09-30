# Tech stack

- **Runtime**: Node.js >=22, CommonJS output (`tsconfig.json`: module commonjs, outDir ./dist, rootDir ./src)
- **Language**: TypeScript 6.0.3 — `strict`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`
- **Framework**: Express **5.2.1** (+ `express-ws`, `express-session`, `csrf-csrf`, `helmet`, `compression`; `express-rate-limit` installed but the Redis sliding-window limiter is what runs)
- **Views**: EJS 6 (`app.set('view engine','ejs')`, view cache on). **No** React/Vue/Svelte/Alpine/htmx — frameworks ripped out in commit 6669be90 (residue remains, see `mem:known_issues`).
- **CSS**: Tailwind CSS **v4** source at `views/styles/main.css` (`@import "tailwindcss"` + `@plugin "@tailwindcss/forms"` + `@custom-variant dark`), composed of 3 token + 3 base + 21 component + 5 page files emitting `.al-*` classes via `@apply`. Built by **Vite 8** (`vite.config.mjs`: input `panel` = views/styles/main.css → `public/assets/css/`, `manifest:true`).
  - **No `@tailwindcss/vite` / `@tailwindcss/postcss` in deps** and no postcss config — see `mem:known_issues`.
- **Client JS**: plain ES modules in `views/javascript/**`; islands export `mount(root, config) → {teardown}`.
- **DB**: PostgreSQL via **Prisma 7** + `@prisma/adapter-pg` (`src/db.ts`). Schema `storage/prisma/schema.prisma` (505 L).
- **Cache/sessions**: Redis via `ioredis` (`src/handlers/redis.ts`)
- **Validation**: Zod 4 — colocated schemas (`modules/*/schemas.ts`, `api/v2/dto.ts`) and daemon boundary schemas in `src/types/daemon.ts`
- **Auth**: bcryptjs (cost 12), `otpauth` (TOTP), `@simplewebauthn/server` (passkeys)
- **Logging**: pino + pino-pretty with regex redaction (`src/handlers/logger.ts`)
- **i18n (LIVE)**: hand-rolled `src/services/i18n.ts` reading `storage/lang/<lang>/lang.json`, 10 languages.
  **Lingui 6 is installed but DEAD** (`src/i18n/index.ts` + `src/handlers/middleware/localeMiddleware.ts` never mounted).
- **Tests**: Vitest 4 (`vitest.config.ts`, `tests/**/*.test.ts`, node env, globals, coverage only over `src/handlers/utils/**`). Playwright configured but **no specs exist**.
- **Lint**: ESLint 10 flat config (`eslint.config.mjs`) — errors: `no-explicit-any`, `eqeqeq`, `curly`, `semi`, `prefer-const`, `consistent-type-definitions: interface`. Warnings do not fail CI.
- **Prettier**: **no config file anywhere** — `pnpm format` uses defaults (double quotes) which fights ESLint single quotes. CI never runs prettier.
- **Packaging**: pnpm workspace, `packageManager: pnpm@11.20.0`
- **Other deps**: Docker-driven remote daemons, `@aws-sdk` (S3), nodemailer, chart.js, `@xterm`, monaco-editor, lucide, DiceBear avatars, adm-zip, cron-parser.