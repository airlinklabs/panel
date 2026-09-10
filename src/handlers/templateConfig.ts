import type { Request, Response, NextFunction } from "express";
import * as timeouts from "../config/timeouts";
import * as limits from "../config/limits";
import * as auth from "../config/auth";
import * as server from "../config/server";
import * as daemonTimeouts from "../config/daemonTimeouts";
import * as urls from "../config/urls";
import * as mime from "../config/mime";
import * as ui from "../config/ui";
import { getConfig } from "../config";

/**
 * Makes all config constants available to EJS templates via res.locals.
 *
 * Usage in templates:
 *   <%= config.limits.DEFAULT_PAGE_SIZE %>
 *   <%= config.server.DEFAULT_SERVER_PORT %>
 *   <%= DEFAULT_PAGE_SIZE %>           (short alias)
 *   <%= DEFAULT_SERVER_PORT %>         (short alias)
 *   <%= panel.url %>                   (panel URL)
 *   <%= panel.assetBaseUrl %>          (CDN/asset base)
 */
export function templateConfigMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  // Panel runtime config (URL, asset base, etc.)
  let panel: ReturnType<typeof getConfig>;
  try {
    panel = getConfig();
  } catch {
    // getConfig may throw if env is malformed — degrade gracefully
    panel = {
      url: process.env.URL || "",
      assetBaseUrl: "",
      cspEnabled: false,
      trustProxy: false,
      cookieDomain: "",
      allowedOrigins: [],
      cookieSecure: false,
      sessionMaxAgeMs: 604800000,
      rateLimitMax: 500,
      rateLimitWindowMs: 60000,
      logLevel: "info",
      storageDir: "",
      maxUploadBytes: 52428800,
      tlsCertPath: "",
      tlsKeyPath: "",
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      smtpFrom: "",
      smtpSecure: true,
      dbPoolMin: 2,
      dbConnectTimeoutMs: 10000,
      nodeEnv: "development",
      isProduction: false,
      isHttps: false,
      port: 3000,
      name: "Airlink",
      sessionSecret: "",
      databaseUrl: "",
      redisUrl: "",
    } as ReturnType<typeof getConfig>;
  }

  res.locals.panel = {
    url: panel.url,
    assetBaseUrl: panel.assetBaseUrl,
    name: panel.name,
    trustProxy: panel.trustProxy,
    cspEnabled: panel.cspEnabled,
    cookieDomain: panel.cookieDomain,
    cookieSecure: panel.cookieSecure,
    isHttps: panel.isHttps,
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
  };

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

  // ── Short aliases for most-used values ───────────────────────────────────
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
