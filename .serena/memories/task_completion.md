# Task completion checklist

Run in order after any change to `src/`:

1. `pnpm db:generate` — only if `storage/prisma/schema.prisma` changed
2. `pnpm typecheck` — `tsc --noEmit` ×2. **CI gate.**
3. `pnpm exec eslint src` — **CI gate**. Use this exact form; `pnpm lint` applies `--fix` and mutates files. Errors fail, warnings do not.
4. `pnpm test` — `vitest run`. **CI gate.**

Do NOT rely on these — broken as shipped (see `mem:known_issues`):
`pnpm format` (no prettier config; rewrites quotes against ESLint), `pnpm test:coverage` (provider not installed), `pnpm db:seed` (no source), `pnpm test:e2e` (no Playwright specs), `pnpm lingui:extract --clean` (empties catalogs).

## What CI requires (`.github/workflows/ci.yml`)
Gate job `ci-gate` = semgrep (SAST) + dependency-review + audit (continue-on-error) + lint + typecheck + unit test + build.
**`e2e` is NOT in `ci-gate.needs`** — a red e2e job does not block the required check.
There is **no format/prettier job**.
Path filters: `src/** views/** public/** storage/prisma/** tests/** tsconfig*.json package.json pnpm-lock.yaml` —
changes to `scripts/**`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` alone trigger **zero** jobs.

## Before claiming a page works
- `node_modules` is absent in this checkout — nothing runs without `pnpm install`.
- 49 `res.render` targets in the live modules resolve to **non-existent views** (`mem:known_issues`), so most admin pages currently 500.
- Static analysis cannot prove a render; boot the app and hit the route.