import type { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as timeouts from '../config/timeouts';
import * as limits from '../config/limits';
import * as auth from '../config/auth';
import * as server from '../config/server';
import * as daemonTimeouts from '../config/daemonTimeouts';
import * as urls from '../config/urls';
import * as mime from '../config/mime';

let panelConfig: { meta?: { version?: string; codename?: string } } = {};
try {
  panelConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../storage/config.json'), 'utf-8'),
  );
} catch {
  /* optional — not all environments have config.json */
}
import * as ui from '../config/ui';
import { getConfig } from '../config';

/**
 * Resolves the actual request protocol (http/https) from the incoming request.
 * When behind a reverse proxy, trusts X-Forwarded-Proto header.
 * Falls back to the env-configured URL protocol.
 */
function resolveRequestProtocol(req: Request, envIsHttps: boolean): string {
  const proto = req.protocol;
  if (proto === 'https' || proto === 'http') {return proto;}
  return envIsHttps ? 'https' : 'http';
}

/**
 * Builds the full origin URL for the current request (e.g. "https://panel.example.com").
 */
function resolveOrigin(
  req: Request,
  envUrl: string,
  envIsHttps: boolean,
): string {
  const assetBase = (req.app.get('assetBaseUrl') as string) || '';
  if (assetBase && /^https?:\/\//.test(assetBase)) {
    return assetBase.replace(/\/+$/, '');
  }
  const host = req.get('host') || new URL(envUrl).host;
  const protocol = resolveRequestProtocol(req, envIsHttps);
  return `${protocol}://${host}`;
}

// ── Vite manifest (loaded once at startup) ──────────────────────────────────
// When Vite builds CSS/JS, it writes .vite/manifest.json mapping source paths
// to content-hashed output paths. assetUrl() resolves through this manifest
// so templates don't hardcode hash strings.
let viteManifest: Record<string, { file: string; css?: string[] }> | null =
  null;
try {
  const manifestPath = path.resolve(
    __dirname,
    '../../public/.vite/manifest.json',
  );
  if (fs.existsSync(manifestPath)) {
    viteManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
} catch {
  /* not built yet — dev mode */
}

/**
 * Makes all config constants available to EJS templates via res.locals.
 *
 * Usage in templates:
 *   <%= assetUrl('styles/tw.css') %>       → "/styles/tw.css" (dev)
 *                                           → "https://cdn.example.com/styles/tw.css" (prod CDN)
 *   <%= assetUrl('assets/css/panel.css') %> → "/assets/css/panel-abc123.css" (Vite hashed)
 *   <%= assetUrl('javascript/shared/csrf.js') %> → "/javascript/shared/csrf.js"
 *   <%= assetPath('styles/tw.css') %>       → alias for assetUrl (legacy compat)
 *   <%= panel.isHttps %>                    → per-request, respects proxy headers
 */
export function templateConfigMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Panel runtime config
  let panel: ReturnType<typeof getConfig>;
  try {
    panel = getConfig();
  } catch {
    panel = {
      url: process.env.URL || '',
      assetBaseUrl: '',
      assetUrl: '',
      cspEnabled: false,
      trustProxy: false,
      cookieDomain: '',
      allowedOrigins: [],
      cookieSecure: false,
      sessionMaxAgeMs: 604800000,
      rateLimitMax: 500,
      rateLimitWindowMs: 60000,
      logLevel: 'info',
      storageDir: '',
      maxUploadBytes: 52428800,
      tlsCertPath: '',
      tlsKeyPath: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      smtpSecure: true,
      dbPoolMin: 2,
      dbConnectTimeoutMs: 10000,
      nodeEnv: 'development',
      isProduction: false,
      isHttps: false,
      port: 3000,
      name: 'Airlink',
      sessionSecret: '',
      databaseUrl: '',
      redisUrl: '',
    } as ReturnType<typeof getConfig>;
  }

  // Per-request protocol detection
  const requestIsHttps = resolveRequestProtocol(req, panel.isHttps) === 'https';
  const requestOrigin = resolveOrigin(req, panel.url, panel.isHttps);

  const assetBase = panel.assetBaseUrl || '';

  res.locals.panel = {
    url: panel.url,
    assetBaseUrl: assetBase,
    name: panel.name,
    version: panelConfig.meta?.version ?? '',
    codename: panelConfig.meta?.codename ?? '',
    trustProxy: panel.trustProxy,
    cspEnabled: panel.cspEnabled,
    cookieDomain: panel.cookieDomain,
    cookieSecure: panel.cookieSecure,
    isHttps: requestIsHttps,
    isProduction: panel.isProduction,
    nodeEnv: panel.nodeEnv,
    logLevel: panel.logLevel,
    storageDir: panel.storageDir,
    maxUploadBytes: panel.maxUploadBytes,
    tlsCertPath: panel.tlsCertPath,
    tlsKeyPath: panel.tlsKeyPath,
    smtpHost: panel.smtpHost,
    smtpPort: panel.smtpPort,
    smtpFrom: panel.smtpFrom,
    smtpSecure: panel.smtpSecure,
    rateLimitMax: panel.rateLimitMax,
    rateLimitWindowMs: panel.rateLimitWindowMs,
    sessionMaxAgeMs: panel.sessionMaxAgeMs,
    dbPoolMin: panel.dbPoolMin,
    dbConnectTimeoutMs: panel.dbConnectTimeoutMs,
    port: panel.port,
    allowedOrigins: panel.allowedOrigins,
    origin: requestOrigin,
  };

  // ── assetUrl() ───────────────────────────────────────────────────────────
  // Single abstraction for all frontend asset URLs.
  // Reads ASSET_URL env var — CDN origin for production, empty for dev.
  // All assets live in public/ — assetUrl('styles/tw.css') → /styles/tw.css
  //
  //   Dev (ASSET_URL unset):
  //     assetUrl('styles/tw.css')                      → /styles/tw.css
  //     assetUrl('javascript/shared/csrf.js')           → /javascript/shared/csrf.js
  //     assetUrl('assets/css/panel.css')                → /assets/css/panel.css
  //
  //   Prod (ASSET_URL=https://cdn.example.com):
  //     assetUrl('styles/tw.css')                      → https://cdn.example.com/styles/tw.css
  //     assetUrl('assets/css/panel-abc123.css')         → https://cdn.example.com/assets/css/panel-abc123.css
  //
  //   Vite manifest resolution:
  //     assetUrl('assets/css/panel.css')                → /assets/css/panel-abc123.css (hashed)
  //
  const ASSET_URL = (process.env.ASSET_URL || '').replace(/\/+$/, '');

  res.locals.assetUrl = function assetUrl(relativePath: string): string {
    // Normalize: strip leading slash so we control the path
    const clean = relativePath.replace(/^\/+/, '');

    // Vite manifest resolution — source path → hashed output path
    if (viteManifest) {
      // Try multiple key formats (manifest may use "public/styles/tw.css" or "styles/tw.css")
      const candidates = [
        clean, // "styles/tw.css"
        `public/${  clean}`, // "public/styles/tw.css"
        clean.replace(/^assets\//, ''), // "css/panel.css" from "assets/css/panel.css"
      ];
      for (const key of candidates) {
        const entry = viteManifest[key];
        if (entry) {
          return ASSET_URL ? `${ASSET_URL  }/${  entry.file}` : `/${  entry.file}`;
        }
      }
    }

    // Normal resolution — prepend ASSET_URL if configured
    return ASSET_URL ? `${ASSET_URL  }/${  clean}` : `/${  clean}`;
  };

  // Legacy alias
  res.locals.assetPath = res.locals.assetUrl;

  // Full config namespaces
  res.locals.config = {
    timeouts,
    limits,
    auth,
    server,
    daemonTimeouts,
    urls,
    mime,
    ui,
  };

  // ── Short aliases ────────────────────────────────────────────────────────
  res.locals.DEFAULT_PAGE_SIZE = limits.DEFAULT_PAGE_SIZE;
  res.locals.ACTIVITY_PAGE_SIZE = limits.ACTIVITY_PAGE_SIZE;
  res.locals.DASHBOARD_PER_PAGE = limits.DASHBOARD_PER_PAGE;
  res.locals.GLOBAL_RATE_LIMIT_MAX = limits.GLOBAL_RATE_LIMIT_MAX;

  res.locals.DEFAULT_SERVER_PORT = server.DEFAULT_SERVER_PORT;
  res.locals.DEFAULT_MAX_STORAGE_MB = server.DEFAULT_MAX_STORAGE_MB;
  res.locals.DEFAULT_DATABASE_LIMIT = server.DEFAULT_DATABASE_LIMIT;
  res.locals.DEFAULT_MAX_MEMORY_MB = server.DEFAULT_MAX_MEMORY_MB;
  res.locals.DEFAULT_MAX_CPU_PERCENT = server.DEFAULT_MAX_CPU_PERCENT;

  res.locals.RP_NAME = auth.RP_NAME;
  res.locals.USERNAME_MAX_LENGTH = auth.USERNAME_MAX_LENGTH;
  res.locals.USERNAME_MIN_LENGTH = auth.USERNAME_MIN_LENGTH;
  res.locals.DESCRIPTION_MAX_LENGTH = auth.DESCRIPTION_MAX_LENGTH;
  res.locals.MIN_PORT = auth.MIN_PORT;
  res.locals.MAX_PORT = auth.MAX_PORT;
  res.locals.MAX_API_KEYS_PER_USER = auth.MAX_API_KEYS_PER_USER;

  res.locals.GITHUB_REPO_URL = urls.GITHUB_REPO_URL;
  res.locals.DISCORD_INVITE_URL = urls.DISCORD_INVITE_URL;
  res.locals.COMPANY_WEBSITE_URL = urls.COMPANY_WEBSITE_URL;
  res.locals.DOCS_QUICKSTART_URL = urls.DOCS_QUICKSTART_URL;
  res.locals.GITHUB_LICENSE_URL = urls.GITHUB_LICENSE_URL;
  res.locals.GITHUB_AVATAR_URL = urls.GITHUB_AVATAR_URL;
  res.locals.GITHUB_AVATAR_FALLBACK = urls.GITHUB_AVATAR_FALLBACK;
  res.locals.CRAFATAR_AVATAR_BASE = urls.CRAFATAR_AVATAR_BASE;
  res.locals.GITHUB_CONTRIBUTORS_URL = urls.GITHUB_CONTRIBUTORS_URL;
  res.locals.GITHUB_ORG_URL = urls.GITHUB_ORG_URL;
  res.locals.DONATION_URL = urls.DONATION_URL;

  res.locals.FILE_UPLOAD_TIMEOUT_MS = ui.FILE_UPLOAD_TIMEOUT_MS;
  res.locals.FILES_PAGE_SIZE = ui.FILES_PAGE_SIZE;
  res.locals.INSTALL_POLL_INTERVAL_MS = ui.INSTALL_POLL_INTERVAL_MS;
  res.locals.PLAYER_LIST_REFRESH_MS = ui.PLAYER_LIST_REFRESH_MS;
  res.locals.DEFAULT_GAME_PORT = ui.DEFAULT_GAME_PORT;
  res.locals.DEFAULT_LANGUAGE = ui.DEFAULT_LANGUAGE;
  res.locals.DEFAULT_THEME = ui.DEFAULT_THEME;
  res.locals.SMTP_DEFAULT_PORT = ui.SMTP_DEFAULT_PORT;

  res.locals.SUPPORTED_LANGUAGES = mime.SUPPORTED_LANGUAGES;

  res.locals.SESSION_MAX_AGE_MS = timeouts.SESSION_MAX_AGE_MS;
  res.locals.SETTINGS_CACHE_TTL_S = timeouts.SETTINGS_CACHE_TTL_S;
  res.locals.DEFAULT_DAEMON_TIMEOUT_MS = timeouts.DEFAULT_DAEMON_TIMEOUT_MS;

  next();
}
