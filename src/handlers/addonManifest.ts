import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const RESERVED_IDENTIFIER_WORDS = [
  'admin', 'api', 'auth', 'login', 'logout', 'static', 'assets',
  'core', 'panel', 'server', 'servers', 'node', 'nodes', 'user',
  'users', 'settings', 'config', 'system', 'status', 'health',
  'ws', 'socket', 'daemon', 'backup', 'backups', 'image', 'images',
  'store', 'addon', 'addons', 'plugin', 'plugins', 'extension',
  'dashboard', 'account', 'files', 'console', 'terminal', 'player',
  'players', 'world', 'worlds', 'startup', 'schedules', 'schedule',
];

const RESERVED_ROUTE_PREFIXES = [
  '/admin', '/api', '/auth', '/login', '/logout', '/static', '/assets',
  '/ws', '/socket', '/daemon', '/server', '/servers', '/node', '/nodes',
  '/user', '/users', '/settings', '/config', '/system', '/status',
  '/health', '/backup', '/backups', '/image', '/images', '/store',
  '/dashboard', '/account', '/files', '/console', '/terminal',
  '/player', '/players', '/world', '/worlds', '/startup', '/schedule',
];

export const addonManifestSchema = z.object({
  name: z.string().min(1),
  identifier: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).optional(),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  main: z.string().optional(),
  router: z.string().optional(),
  enabled: z.boolean().optional(),
  engines: z.object({
    panel: z.string(),
  }).partial().optional(),
  permissions: z.array(z.string()).optional(),
  capabilities: z.object({
    wrapsDashboard: z.boolean().optional(),
    wrapsAdminLayout: z.boolean().optional(),
    runsRawSql: z.boolean().optional(),
    registersSchedules: z.boolean().optional(),
  }).optional(),
  settingsSchema: z.array(z.object({
    key: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean']),
    label: z.string().min(1),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().optional(),
  })).optional(),
  dependencies: z.array(z.object({
    identifier: z.string(),
    range: z.string().optional(),
  })).optional(),
  migrations: z.array(z.object({
    name: z.string().min(1),
    sql: z.string().min(1),
    down: z.string().optional(),
  })).optional(),
  dontfuckinganimateme: z.boolean().optional(),
});

export type AddonManifestV2 = z.infer<typeof addonManifestSchema>;

export type ParseManifestResult =
  | { success: true; manifest: AddonManifestV2; filePath: string }
  | { success: false; error: string; filePath: string };

export function parseAddonManifest(filePath: string, addonSlug?: string): ParseManifestResult {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `package.json not found at ${filePath}`,
        filePath,
      };
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        success: false,
        error: `Invalid JSON in ${filePath}`,
        filePath,
      };
    }

    const result = addonManifestSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return {
        success: false,
        error: `Manifest validation failed: ${issues}`,
        filePath,
      };
    }

    const manifest = result.data;
    const slug = addonSlug ?? path.basename(path.dirname(filePath));

    if (manifest.identifier && manifest.identifier !== slug) {
      return {
        success: false,
        error: `Identifier mismatch: manifest declares "${manifest.identifier}" but folder is "${slug}"`,
        filePath,
      };
    }

    if (manifest.identifier) {
      const lower = manifest.identifier.toLowerCase();
      if (RESERVED_IDENTIFIER_WORDS.includes(lower)) {
        return {
          success: false,
          error: `Reserved identifier: "${manifest.identifier}"`,
          filePath,
        };
      }
    }

    if (manifest.router) {
      const routerPath = manifest.router.startsWith('/') ? manifest.router : `/${manifest.router}`;
      const isReserved = RESERVED_ROUTE_PREFIXES.some(p => routerPath === p || routerPath.startsWith(p + '/'));
      if (isReserved) {
        return {
          success: false,
          error: `Reserved route prefix: "${manifest.router}"`,
          filePath,
        };
      }
    }

    if (manifest.permissions && manifest.identifier) {
      const ns = `addon.${manifest.identifier}.`;
      for (const perm of manifest.permissions) {
        if (!perm.startsWith(ns)) {
          return {
            success: false,
            error: `Permission "${perm}" outside addon namespace "${ns}"`,
            filePath,
          };
        }
      }
    }

    return { success: true, manifest, filePath };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to parse manifest: ${error.message}`,
      filePath,
    };
  }
}

export function getManifestIdentifier(manifest: AddonManifestV2, fallbackSlug: string): string {
  return manifest.identifier ?? fallbackSlug;
}

export function isVersionInRange(version: string, range: string): boolean {
  if (!range || range === '*') return true;

  const cleanVersion = version.replace(/^[^\d]*/, '');
  const parts = cleanVersion.split('.').map(Number);
  const rangeParts = range.split('.').map(p => {
    const clean = p.replace(/^[^\d]*/, '');
    return clean === '' ? null : Number(clean);
  });

  while (parts.length < 3) parts.push(0);
  while (rangeParts.length < 3) rangeParts.push(null);

  if (range.startsWith('>=')) {
    return compareVersions(parts, rangeParts.slice(1)) >= 0;
  }
  if (range.startsWith('>')) {
    return compareVersions(parts, rangeParts.slice(1)) > 0;
  }
  if (range.startsWith('<=')) {
    return compareVersions(parts, rangeParts.slice(1)) <= 0;
  }
  if (range.startsWith('<')) {
    return compareVersions(parts, rangeParts.slice(1)) < 0;
  }
  if (range.startsWith('=')) {
    return compareVersions(parts, rangeParts.slice(1)) === 0;
  }
  if (range.includes(' - ')) {
    const [min, max] = range.split(' - ');
    return compareVersions(parts, parseVersion(min)) >= 0 && compareVersions(parts, parseVersion(max)) <= 0;
  }
  if (range.includes('||')) {
    return range.split('||').some(r => isVersionInRange(version, r.trim()));
  }

  return compareVersions(parts, rangeParts) === 0;
}

function parseVersion(v: string): number[] {
  const clean = v.replace(/^[^\d]*/, '');
  const parts = clean.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}
