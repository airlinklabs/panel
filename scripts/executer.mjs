#!/usr/bin/env node

/**
 * executer.mjs — Unified script dispatcher for all package.json commands.
 *
 * Usage:
 *   node scripts/executer.mjs <command> [args...]
 *   node scripts/executer.mjs --help
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, box } from './ui.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, '..');

const TTY = process.stdout.isTTY;

// ── Commands ─────────────────────────────────────────────────────────────────

const commands = {
  // Server
  start: {
    desc: 'Start the panel server',
    run: () => exec('node --env-file=.env dist/app.js'),
  },
  dev: {
    desc: 'Start in development mode (prisma + vite + nodemon)',
    run: () =>
      exec(
        'prisma generate && prisma db push && (trap \'kill 0\' EXIT; vite build --watch & nodemon)',
      ),
  },

  // Build
  build: {
    desc: 'Full build (tsc + prisma generate + vite)',
    run: () => exec('tsc && tsc -p tsconfig.prisma.json && vite build'),
  },
  'build:assets': {
    desc: 'Vite build only (assets + css)',
    run: () => exec('vite build'),
  },

  // Quality
  typecheck: {
    desc: 'TypeScript type checking (no emit)',
    run: () => exec('tsc --noEmit && tsc -p tsconfig.prisma.json --noEmit'),
  },
  lint: { desc: 'ESLint with auto-fix', run: () => exec('eslint src --fix') },
  format: {
    desc: 'Prettier formatting on src/',
    run: () => exec('prettier --write src/'),
  },

  // Testing
  test: { desc: 'Run vitest (single pass)', run: () => exec('vitest run') },
  'test:watch': { desc: 'Run vitest in watch mode', run: () => exec('vitest') },
  'test:coverage': {
    desc: 'Run vitest with coverage report',
    run: () => exec('vitest run --coverage'),
  },
  'test:e2e': {
    desc: 'Run Playwright e2e tests',
    run: () => exec('npx playwright test'),
  },
  'test:e2e:ui': {
    desc: 'Run Playwright e2e with browser UI',
    run: () => exec('npx playwright test --ui'),
  },
  'test:docker': {
    desc: 'Run tests inside Docker containers',
    run: () =>
      exec(
        'docker compose -f tests/docker/docker-compose.test.yml up --build --abort-on-container-exit',
      ),
  },
  'test:all': {
    desc: 'Run vitest + Playwright e2e',
    run: () => exec('vitest run && npx playwright test'),
  },

  // Database
  'db:generate': {
    desc: 'Prisma generate (regenerate client)',
    run: () => exec('prisma generate'),
  },
  'db:push': {
    desc: 'Prisma db push (sync schema to database)',
    run: () => exec('prisma db push'),
  },
  'db:migrate': {
    desc: 'Prisma migrate dev (create + apply migration)',
    run: () => exec('prisma migrate dev'),
  },
  'db:migrate:deploy': {
    desc: 'Prisma migrate deploy + generate',
    run: () => exec('prisma migrate deploy && prisma generate'),
  },
  'db:seed': {
    desc: 'Run database seed script',
    run: () => exec('node dist/cli/seed.js'),
  },
  'db:studio': {
    desc: 'Open Prisma Studio (database GUI)',
    run: () => exec('prisma studio'),
  },
  'db:status': {
    desc: 'Show Prisma migration status',
    run: () => exec('prisma migrate status'),
  },

  // Misc
  help: {
    desc: 'Show all available commands',
    run: () => {
      showHelp();
      return '';
    },
  },
  secret: {
    desc: 'Generate new SESSION_SECRET',
    run: () => exec('node dist/cli/secret.js'),
  },
};

// ── Sections (for help display) ──────────────────────────────────────────────

const sections = [
  { label: 'Server', cmds: ['start', 'dev'] },
  { label: 'Build', cmds: ['build', 'build:assets'] },
  { label: 'Quality', cmds: ['typecheck', 'lint', 'format'] },
  {
    label: 'Testing',
    cmds: [
      'test',
      'test:watch',
      'test:coverage',
      'test:e2e',
      'test:e2e:ui',
      'test:docker',
      'test:all',
    ],
  },
  {
    label: 'Database',
    cmds: [
      'db:generate',
      'db:push',
      'db:migrate',
      'db:migrate:deploy',
      'db:seed',
      'db:studio',
      'db:status',
    ],
  },
  { label: 'Misc', cmds: ['help', 'secret'] },
];

// ── Routed scripts (own .mjs files) ──────────────────────────────────────────

const routed = [
  { name: 'setup', file: 'setup.mjs', desc: 'Interactive panel setup' },
  {
    name: 'db:reset',
    file: 'db-reset.mjs',
    desc: 'Nuclear database reset + recreate',
  },
  {
    name: 'db:backup',
    file: 'db-backup.mjs',
    desc: 'Backup database (optional AES encryption)',
  },
  {
    name: 'db:cleanup',
    file: 'db-cleanup.mjs',
    desc: 'Drop database + role permanently (no recreate)',
  },
];

// ── Execution ────────────────────────────────────────────────────────────────

function exec(cmd) {
  const t0 = Date.now();
  const binPath = resolve(projectDir, 'node_modules/.bin');
  const env = { ...process.env, PATH: `${binPath}:${process.env.PATH}` };
  const result = spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: projectDir,
    env,
    timeout: 600_000,
  });
  const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  if (result.status !== 0) {
    Logger.fail(
      `Command failed (${elapsed}, exit ${result.status ?? 'unknown'})`,
    );
    process.exit(result.status ?? 1);
  }
  return elapsed;
}

// ── Help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  const maxCmd = Math.max(
    ...(commands.keys ? [...commands.keys()] : Object.keys(commands)),
    ...routed.map((r) => r.name),
  );

  // Read version from package.json
  let version = '2.5.x';
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(projectDir, 'package.json'), 'utf8'),
    );
    version = pkg.version || version;
  } catch {}

  if (TTY) {
    Logger.banner('Airlink Panel', version, 'Unified script dispatcher');
  }

  console.log('  Usage');
  console.log('  node scripts/executer.mjs <command> [flags]');
  console.log();

  for (const section of sections) {
    console.log(`  ${section.label}`);
    for (const name of section.cmds) {
      const cmd = commands[name];
      if (!cmd) {continue;}
      console.log(`    ${name.padEnd(maxCmd + 2)} ${cmd.desc}`);
    }
    console.log();
  }

  console.log('  Routed (own .mjs files)');
  for (const r of routed) {
    console.log(`    ${r.name.padEnd(maxCmd + 2)} ${r.desc}`);
  }
  console.log();
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);

if (!command || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

// Route to own .mjs files
const route = routed.find((r) => r.name === command);
if (route) {
  const args = rest.map((a) => `"${a}"`).join(' ');
  exec(`node scripts/${route.file} ${args}`);
  process.exit(0);
}

const cmd = commands[command];
if (!cmd) {
  Logger.fail(`Unknown command: ${command}`);
  Logger.dim('Run \'node scripts/executer.mjs --help\' for available commands.');
  process.exit(1);
}

if (TTY) {
  Logger.gap();
  console.log(`  airlink -> ${command}`);
  Logger.gap();
}

const elapsed = cmd.run();

if (TTY && elapsed) {
  Logger.gap();
  Logger.ok(`Done in ${elapsed}`);
}
