# Suggested commands

## Run
- `pnpm install` — required first; `node_modules` may be absent
- `pnpm dev` — `prisma generate && prisma db push && (vite build --watch & nodemon)`; nodemon runs `node --import tsx --env-file=.env src/app.ts` (TS from source, `__dirname` = `src`)
- `pnpm build` — `tsc && tsc -p tsconfig.prisma.json && vite build`
- `pnpm start` — `node --env-file=.env dist/app.js` (needs `pnpm build` first)
- `pnpm help` — dispatcher help (`scripts/executer.mjs`)

## Quality
- `pnpm db:generate` first if `storage/prisma/schema.prisma` changed (`src/generated` is gitignored)
- `pnpm typecheck` — `tsc --noEmit` ×2. **CI gate.** `tests/**` and `storage/addons/**` are NOT type-checked.
- `pnpm exec eslint src` — **CI gate**; use this to verify. `pnpm lint` instead runs `eslint src --fix` and mutates files.

## Test
- `pnpm test` — `vitest run` (**CI gate**), `pnpm test:watch`
- `pnpm test:docker` — self-contained postgres+redis via `tests/docker/docker-compose.test.yml`

## Database
- `pnpm db:generate` / `db:push` / `db:migrate` / `db:migrate:deploy` / `db:studio` / `db:status`
- `pnpm db:reset` / `db:backup` / `db:cleanup` — separate `.mjs` scripts

## Local = CI recipe (`.github/workflows/ci.yml:221-260`)
install → write `.env` → `prisma generate` → `prisma db push` → `pnpm test` (needs postgres:16 + redis:7).

## Shell notes
- Quote globs for zsh: `grep -rn "x" src --include='*.ts'` (bare `--include=*.ts` errors)
- `serena memories check` from project root validates these memory references

## Broken — do not use (see `mem:known_issues`)
`pnpm format`, `pnpm test:coverage`, `pnpm db:seed`, `pnpm test:e2e`, `pnpm lingui:extract --clean`