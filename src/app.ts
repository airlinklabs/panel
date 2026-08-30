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
import { translationMiddleware } from './handlers/utils/core/translation';
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

// Trust proxy when the panel is behind a reverse proxy (Nginx, Caddy, etc).
// Reads from DB at startup — affects req.ip used by rate limiting and IP banning.
// We set this before any middleware so the correct client IP flows through.
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
app.use('/vendor', express.static(path.join(__dirname, '../node_modules')));

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
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = res.locals.nonce as string;

  helmet({
    noSniff: true,
    frameguard: { action: 'deny' },
    hsts: isHttps
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
    originAgentCluster: isHttps ? undefined : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    contentSecurityPolicy: isProduction
      ? {
        directives: {
          defaultSrc: ['\'self\''],
          scriptSrc: ['\'self\'', `'nonce-${nonce}'`, '\'strict-dynamic\''],
          scriptSrcAttr: ['\'unsafe-inline\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
          fontSrc: ['\'self\'', 'data:'],
          imgSrc: ['\'self\'', 'data:', 'blob:', 'https:'],
          connectSrc: ['\'self\'', ...(isHttps ? ['wss:'] : ['ws:', 'wss:'])],
          frameAncestors: ['\'none\''],
          objectSrc: ['\'none\''],
          baseUri: ['\'self\''],
          formAction: ['\'self\''],
          upgradeInsecureRequests: [],
        },
      }
      : false,
  })(req, res, next);
});

// Initial load + refresh every 30 seconds
refreshSecurityCache();
setInterval(refreshSecurityCache, 30_000);

// IP ban middleware — uses cached list, no per-request DB hit
app.use((req, res, next) => {
  const clientIp = getClientIp(req);
  if (getSecurityCache().bannedIps.includes(clientIp)) {
    renderErrorPage(
      req,
      res,
      403,
      'Your IP address is blocked from this panel.',
    );
    return;
  }
  next();
});

// Rate limiter — Redis-backed sliding window for distributed/multi-instance support
app.use(
  createRedisRateLimit({
    windowMs: 60 * 1000,
    max: 500,
    keyPrefix: 'rl:global',
    skip: () => !getSecurityCache().rateLimitEnabled,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Load session with Redis store
const useSecureCookie = panelConfig.isHttps;
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
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(
  express.json({
    limit: '512kb',
  }),
);
app.use(
  express.urlencoded({
    extended: false,
    limit: '512kb',
    parameterLimit: 1000,
  }),
);
app.use(
  express.raw({
    limit: '1mb',
  }),
);
app.use(
  express.text({
    limit: '512kb',
  }),
);

// Load cookies
app.use(cookieParser());

// Load translation
app.use(translationMiddleware);

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

// Load modules, plugins, database and start the webserver
(async () => {
  try {
    // ── Initialize with ora-style progress ─────────────────────────────────
    await databaseLoader();
    logger.info('Database connected');

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

    const server = app.listen(port, () => {
      logger.success(`Listening on port ${port}`);
      startPlayerStatsCollection();
      startScheduler();
      reenqueueQueuedInstalls();
      initEggCatalogue().catch((err) =>
        logger.warn(`Store catalogue init failed: ${err?.message || err}`),
      );
      import('./handlers/realtime/nodeStatsWs').then((m) =>
        m.attachNodeStatsWs(server),
      );
    });

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
              5_000,
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
