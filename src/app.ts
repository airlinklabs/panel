import { getSettings } from './handlers/settingsCache';
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'net';
import express from 'express';
import prisma from './db';
import path from 'path';
import session from 'express-session';
import { loadEnv } from './handlers/envLoader';
import { databaseLoader } from './handlers/databaseLoader';
import { loadModules } from './handlers/modulesLoader';
import logger, { drawBanner } from './handlers/logger';
import config from '../storage/config.json';
import cookieParser from 'cookie-parser';
import expressWs from 'express-ws';
import compression from 'compression';
import { i18nMiddleware, initI18n } from './services/i18n';
import { templateConfigMiddleware } from './handlers/templateConfig';
import { getSessionStore } from './handlers/sessionStore';
import { settingsLoader } from './handlers/settingsLoader';
import { loadAddons, setAppInstance } from './handlers/addonHandler';
import {
  initializeDefaultUIComponents,
  uiComponentStore,
} from './handlers/uiComponentHandler';
import { startPlayerStatsCollection } from './handlers/playerStatsCollector';
import { startScheduler } from './handlers/schedulerWorker';
import { initEggCatalogue } from './handlers/eggCatalogueService';
import { reenqueueQueuedInstalls } from './handlers/installQueue';
import crypto from 'crypto';
import helmet from 'helmet';
import { createRedisRateLimit } from './handlers/utils/security/redisRateLimit';
import {
  HSTS_MAX_AGE_S,
  SECURITY_CACHE_REFRESH_MS,
  RATE_LIMIT_WINDOW_MS,
  GLOBAL_RATE_LIMIT_MAX,
  SESSION_MAX_AGE_MS,
  JSON_BODY_LIMIT,
  URLENCODED_LIMIT,
  RAW_BODY_LIMIT,
  PRISMA_DISCONNECT_TIMEOUT_MS,
} from './config/defaults';
import icon from './utils/icon';
import { getClientIp } from './utils/ip';
import csrfProtection, {
  handleCsrfError,
  addCsrfTokenToLocals,
} from './handlers/utils/security/csrfProtection';
import { isCsrfExempt } from './handlers/utils/security/csrfRouting';
import {
  errorPageHandler,
  notFoundHandler,
  renderErrorPage,
} from './handlers/errorPages';
import { logSystemError } from './services/systemLogService';

import fs from 'fs';
import { getConfig } from './config';
import { installRenderResolver } from './handlers/renderResolver';
import { validationErrorBoundary } from './utils/validation';
import {
  refreshSecurityCache,
  getSecurityCache,
} from './handlers/securityCache';

loadEnv();

process.setMaxListeners(20);

const app = express();

// Validated configuration. In production, a missing/weak SESSION_SECRET makes
// getConfig() throw, which aborts startup with a clear message instead of
// silently generating a fresh secret (invalidating all sessions).
let panelConfig: ReturnType<typeof getConfig>;
try {
  panelConfig = getConfig();
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
process.env.SESSION_SECRET = panelConfig.sessionSecret;

const port = panelConfig.port;
const name = panelConfig.name;
const airlinkVersion = config.meta.version;
const airlinkCodename = config.meta.codename;

// ── Startup banner ───────────────────────────────────────────────────────────
drawBanner('Airlink Panel', airlinkVersion, airlinkCodename);

// Trust proxy — when behind Nginx/Caddy/Cloudflare, trust forwarded headers
// so req.ip reflects the real client IP. Configurable via TRUST_PROXY env or
// the admin "behind reverse proxy" toggle (DB). Env takes precedence.
if (panelConfig.trustProxy) {
  app.set('trust proxy', 1);
} else {
  // Fall back to DB setting (async, after startup)
  (async () => {
    try {
      const s = await getSettings();
      if (s?.behindReverseProxy) {
        app.set('trust proxy', 1);
      }
    } catch {
      // DB not ready yet — leave default (no trust proxy)
    }
  })();
}

// Load websocket
const expressWsInstance = expressWs(app);

// Load static files
app.use(express.static(path.join(__dirname, '../public')));

// Runtime uploads (user-uploaded files)
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));

// Themes — built-in + user-installed
app.use('/themes', express.static(path.join(__dirname, '../storage/themes')));

// Root favicon (runtime-generated)
app.use(
  '/favicon.ico',
  express.static(path.join(__dirname, '../public/assets/favicon.ico')),
);

// Vendor — serve node_modules directly at /vendor/
// Force correct MIME types for JS files to prevent "text/html" mismatches
// when express.static falls through (missing files, directory index, etc).
app.use(
  '/vendor',
  express.static(path.join(__dirname, '../node_modules'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.cjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      // Prevent browsers from MIME-sniffing JS as HTML
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }),
);

// Fonts — Inter via @fontsource
app.use(
  '/vendor/@fontsource-variable/inter',
  express.static(
    path.join(__dirname, '../node_modules/@fontsource-variable/inter'),
  ),
);

// Load views
const viewsPath = path.join(__dirname, '../views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');
// Cache compiled EJS templates in memory. In production this is already the
// default, but setting it explicitly ensures it's on regardless of NODE_ENV.
app.set('view cache', true);

const addonViewsDir = path.join(__dirname, '../../storage/addons');

// Load compression
app.use(compression());

// htmx detection — sets req.htmx for all downstream handlers
app.use((req: any, _res, next) => {
  req.htmx = req.headers['hx-request'] === 'true';
  next();
});

// =============================================================================
// Security middleware
// =============================================================================
const isHttps = panelConfig.isHttps;
const isProduction = panelConfig.isProduction;

// Nonce middleware — generates a per-request CSP nonce for XSS protection.
// Exposed as res.locals.nonce (EJS templates) and req.nonce (downstream handlers).
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  req.nonce = nonce;
  next();
});

// X-Request-Id — propagates a stable request ID from browser → panel → daemon for distributed tracing.
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  const requestId =
    (typeof incoming === 'string' && incoming.trim()) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// Helmet — explicit config for precise header control across HTTP and HTTPS.
// CSP_ENABLED env var overrides the default (production-only) behavior.
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = res.locals.nonce as string;

  helmet({
    noSniff: true,
    frameguard: { action: 'deny' },
    hsts: isHttps
      ? { maxAge: HSTS_MAX_AGE_S, includeSubDomains: true, preload: true }
      : false,
    crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
    originAgentCluster: isHttps ? undefined : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    contentSecurityPolicy: panelConfig.cspEnabled
      ? {
        directives: {
          defaultSrc: ['\'self\''],
          scriptSrc: [
            '\'self\'',
            `'nonce-${nonce}'`,
            '\'strict-dynamic\'',
            // Alpine.js uses new Function() internally for directive compilation
            '\'unsafe-eval\'',
          ],
          scriptSrcAttr: ['\'unsafe-inline\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
          fontSrc: ['\'self\'', 'data:'],
          imgSrc: ['\'self\'', 'data:', 'blob:', 'https:'],
          connectSrc: [
            '\'self\'',
            ...(isHttps ? ['wss:'] : ['ws:', 'wss:']),
            ...(panelConfig.allowedOrigins || []),
          ],
          frameAncestors: ['\'none\''],
          objectSrc: ['\'none\''],
          baseUri: ['\'self\''],
          formAction: ['\'self\''],
          ...(isHttps ? { upgradeInsecureRequests: [] } : {}),
        },
      }
      : false,
  })(req, res, next);
});

// Initial load + refresh every 30 seconds
refreshSecurityCache();
setInterval(refreshSecurityCache, SECURITY_CACHE_REFRESH_MS);

// IP ban middleware — uses cached list, no per-request DB hit
app.use((req, res, next) => {
  const clientIp = getClientIp(req);
  if (getSecurityCache().bannedIps.includes(clientIp)) {
    renderErrorPage(
      req,
      res,
      403,
      'You\'re blocked so shoo you are not welcome here...',
    );
    return;
  }
  next();
});

// Rate limiter — Redis-backed sliding window for distributed/multi-instance support
app.use(
  createRedisRateLimit({
    windowMs: panelConfig.rateLimitWindowMs || RATE_LIMIT_WINDOW_MS,
    max: panelConfig.rateLimitMax || GLOBAL_RATE_LIMIT_MAX,
    keyPrefix: 'rl:global',
    skip: () =>
      panelConfig.rateLimitMax === 0 || !getSecurityCache().rateLimitEnabled,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Load session with Redis store
// secure: true when HTTPS is detected or when COOKIE_SECURE env is set
// domain: set via COOKIE_DOMAIN for cross-subdomain sessions
const useSecureCookie = panelConfig.cookieSecure;
const sessionSecret = panelConfig.sessionSecret;

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: getSessionStore(),
    cookie: {
      secure: useSecureCookie,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: panelConfig.sessionMaxAgeMs || SESSION_MAX_AGE_MS,
      ...(panelConfig.cookieDomain ? { domain: panelConfig.cookieDomain } : {}),
    },
  }),
);

app.use(
  express.json({
    limit: JSON_BODY_LIMIT,
  }),
);
app.use(
  express.urlencoded({
    extended: false,
    limit: JSON_BODY_LIMIT,
    parameterLimit: URLENCODED_LIMIT,
  }),
);
app.use(
  express.raw({
    limit: RAW_BODY_LIMIT,
  }),
);
app.use(
  express.text({
    limit: JSON_BODY_LIMIT,
  }),
);

// Load cookies
app.use(cookieParser());

// Initialize i18n — pre-load all language bundles at startup
initI18n();

// Load translation — attaches req.t(), req.tn(), res.locals.t to every request
app.use(i18nMiddleware);

// Config constants for EJS templates
app.use(templateConfigMiddleware);

// Apply CSRF protection
app.use((req, res, next) => {
  if (isCsrfExempt(req)) {
    return next();
  }
  csrfProtection(req, res, next);
});

// Add CSRF token to view locals
app.use((req, res, next) => {
  if (isCsrfExempt(req)) {
    return next();
  }
  addCsrfTokenToLocals(req, res, next);
});

// Handle CSRF errors
app.use(handleCsrfError);

app.use(async (_req, res, next) => {
  res.locals.name = name;
  res.locals.airlinkVersion = airlinkVersion;
  res.locals.airlinkCodename = airlinkCodename;
  res.locals.icon = icon;
  global.uiComponentStore = uiComponentStore;
  global.appName = name;
  global.airlinkVersion = airlinkVersion;
  global.airlinkCodename = airlinkCodename;

  res.locals.adminMenuItems = uiComponentStore.getSidebarItems(undefined, true);
  res.locals.regularMenuItems = uiComponentStore.getSidebarItems(
    undefined,
    false,
  );
  res.locals.adminSidebarGroups = uiComponentStore.getAdminSidebarGroups();

  res.locals.isMobileViewport = false;

  try {
    const { getSettings } = await import('./handlers/settingsCache');
    res.locals.settings = await getSettings();
  } catch {
    res.locals.settings = null;
  }

  next();
});

// Explicit primary/addon view resolver
app.use(
  installRenderResolver({
    viewsPath,
    addonViewsDir,
  }),
);

// Catch errors from global middleware registered before modules.
app.use(errorPageHandler);

// Seed default roles if the Role table is empty (fresh DB after prisma db push).
async function seedDefaultRoles() {
  const count = await prisma.role.count();
  if (count > 0) {
    return;
  }
  const now = new Date();
  const defaults = [
    {
      name: 'owner',
      displayName: 'Owner',
      description: 'Full system owner',
      isAdmin: true,
      isSystem: true,
      sortOrder: 0,
      permissions: '[]',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'admin',
      displayName: 'Admin',
      description: 'Administrator',
      isAdmin: true,
      isSystem: true,
      sortOrder: 1,
      permissions: '[]',
      createdAt: now,
      updatedAt: now,
    },
    {
      name: 'user',
      displayName: 'User',
      description: 'Standard user',
      isAdmin: false,
      isSystem: true,
      sortOrder: 2,
      permissions: '[]',
      createdAt: now,
      updatedAt: now,
    },
  ];
  await prisma.role.createMany({ data: defaults });
  logger.info('Default roles seeded');
}

// Load modules, plugins, database and start the webserver
(async () => {
  try {
    // ── Initialize with ora-style progress ─────────────────────────────────
    await databaseLoader();
    logger.info('Database connected');

    // Seed default roles if missing (needed for fresh DBs after prisma db push).
    await seedDefaultRoles();

    await settingsLoader();
    logger.info('Settings loaded');

    initializeDefaultUIComponents();
    logger.info('UI components initialized');

    await loadModules(app, airlinkVersion, Number(port), expressWsInstance);
    logger.info('Modules loaded');

    setAppInstance(app);
    await loadAddons(app);
    logger.info('Addons loaded');

    // Consistent request-validation boundary
    app.use(validationErrorBoundary);

    app.use(notFoundHandler);
    app.use(errorPageHandler);

    // Global unhandled error logger — captures errors that slip through middleware
    process.on('unhandledRejection', (reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      logSystemError({
        message: `Unhandled rejection: ${msg}`,
        stack,
        component: 'api',
        severity: 'error',
      });
    });
    process.on('uncaughtException', (err: Error) => {
      logSystemError({
        message: `Uncaught exception: ${err.message}`,
        stack: err.stack,
        component: 'api',
        severity: 'critical',
      });
    });

    const server = (() => {
      // Direct TLS — when cert/key are provided, serve HTTPS without a reverse proxy
      if (panelConfig.tlsCertPath && panelConfig.tlsKeyPath) {
        try {
          const https = require('node:https') as typeof import('node:https');
          const options = {
            cert: fs.readFileSync(panelConfig.tlsCertPath),
            key: fs.readFileSync(panelConfig.tlsKeyPath),
          };
          const srv = https.createServer(options, app);
          srv.listen(port, () => {
            logger.success(`Listening on port ${port} (HTTPS)`);
          });
          return srv;
        } catch (err) {
          logger.warn(
            `TLS cert/key failed to load (${err instanceof Error ? err.message : err}), falling back to HTTP`,
          );
        }
      }
      return app.listen(port, () => {
        logger.success(`Listening on port ${port}`);
      });
    })();

    startPlayerStatsCollection();
    startScheduler();
    reenqueueQueuedInstalls();
    initEggCatalogue().catch((err) =>
      logger.warn(`Store catalogue init failed: ${err?.message || err}`),
    );
    import('./handlers/realtime/nodeStatsWs').then((m) =>
      m.attachNodeStatsWs(server),
    );

    let shuttingDown = false;
    const connections = new Set<Socket>();

    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });

    async function shutdown(signal: string) {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      const t0 = Date.now();
      const elapsed = () => `${Date.now() - t0}ms`;

      logger.info(`${signal} received — starting graceful shutdown`);

      // 1. Stop accepting new connections
      server.close();
      logger.info(`HTTP server stopped accepting connections ${elapsed()}`);

      // 2. Destroy existing keep-alive connections
      const connCount = connections.size;
      for (const conn of connections) {
        try {
          conn.destroy();
        } catch {
          /* already closed */
        }
      }
      connections.clear();
      logger.info(`Destroyed ${connCount} open connection(s) ${elapsed()}`);

      // 3. Disconnect Prisma
      try {
        await Promise.race([
          prisma.$disconnect(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('prisma disconnect timeout')),
              PRISMA_DISCONNECT_TIMEOUT_MS,
            ),
          ),
        ]);
        logger.info(`Database disconnected ${elapsed()}`);
      } catch (err) {
        logger.warn(
          `Database disconnect failed: ${err instanceof Error ? err.message : err} ${elapsed()}`,
        );
      }

      logger.info(`Shutdown complete ${elapsed()}`);
      process.exit(0);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to load modules or database:', err);
  }
})();

export default app!;
// ci-trigger
