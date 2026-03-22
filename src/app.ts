/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2025 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import session from 'express-session';
import { loadEnv } from './handlers/envLoader';
import { databaseLoader } from './handlers/databaseLoader';
import { loadModules } from './handlers/modulesLoader';
import logger from './handlers/logger';
import config from '../storage/config.json';
import cookieParser from 'cookie-parser';
import expressWs from 'express-ws';
import compression from 'compression';
import { translationMiddleware } from './handlers/utils/core/translation';
import PrismaSessionStore from './handlers/sessionStore';
import { settingsLoader } from './handlers/settingsLoader';
import { loadAddons } from './handlers/addonHandler';
import {
  initializeDefaultUIComponents,
  uiComponentStore,
} from './handlers/uiComponentHandler';
import { installDaemonRequestInterceptor } from './handlers/utils/core/daemonRequest';
import { startPlayerStatsCollection } from './handlers/playerStatsCollector';
import { initEggCatalogue } from './handlers/eggCatalogueService';
import prisma from './db';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import fs from 'fs';
import csrfProtection, {
  handleCsrfError,
  addCsrfTokenToLocals,
} from './handlers/utils/security/csrfProtection';
import {
  spaMiddleware,
  handleSPAPageRequest,
  setupSPARoutes,
} from './handlers/spaHandler';

loadEnv();

// Set max listeners
process.setMaxListeners(20);

const app = express();
const port = process.env.PORT || 3000;
const name = process.env.NAME || 'AirLink';
const airlinkVersion = config.meta.version;

// Trust proxy when the panel is behind a reverse proxy (Nginx, Caddy, etc).
// Reads from DB at startup — affects req.ip used by rate limiting and IP banning.
// We set this before any middleware so the correct client IP flows through.
(async () => {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (s?.behindReverseProxy) {
      app.set('trust proxy', 1);
    }
  } catch {
    // DB not ready yet — leave default (no trust proxy)
  }
})();

// Load websocket
expressWs(app);

// Load static files
// styles.css and JS files are rebuilt on deploy — give them a long cache.
// Themes, favicons, and uploads are user-controlled so they get a short cache.
const LONG_CACHE  = { maxAge: '1y', immutable: true };
const SHORT_CACHE = { maxAge: '1h' };

app.use('/styles.css',          express.static(path.join(__dirname, '../public'), LONG_CACHE));
app.use('/layout-animations.css', express.static(path.join(__dirname, '../public'), LONG_CACHE));
app.use('/javascript',          express.static(path.join(__dirname, '../public/javascript'), LONG_CACHE));
app.use('/js',                  express.static(path.join(__dirname, '../public/js'), LONG_CACHE));
app.use('/themes',              express.static(path.join(__dirname, '../public/themes'), SHORT_CACHE));
app.use('/assets',              express.static(path.join(__dirname, '../public/assets'), SHORT_CACHE));
app.use('/uploads',             express.static(path.join(__dirname, '../public/uploads'), SHORT_CACHE));
app.use(express.static(path.join(__dirname, '../public')));

app.use(
  '/monaco',
  express.static(path.join(__dirname, '../node_modules', 'monaco-editor/min'), LONG_CACHE),
);

app.use(
  '/vendor',
  express.static(path.join(__dirname, '../node_modules', '@formkit/auto-animate'), LONG_CACHE),
);

// Load views
const viewsPath = path.join(__dirname, '../views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

import ejs from 'ejs';

const originalRenderFile = (ejs as any).__express
  ? (ejs as any).__express.bind(ejs)
  : (ejs as any).renderFile.bind(ejs);

const addonViewsDir = path.join(__dirname, '../../storage/addons');

function getAddonDirs(): string[] {
  if (!fs.existsSync(addonViewsDir)) return [];
  return fs
    .readdirSync(addonViewsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

(ejs as any).renderFile = function (
  file: string,
  data: any,
  options: any,
  callback: any,
) {
  try {
    if (fs.existsSync(file)) {
      return originalRenderFile(file, data, options, callback);
    }

    const viewName = path.basename(file);

    for (const addonDir of getAddonDirs()) {
      const addonViewPath = path.join(addonViewsDir, addonDir, 'views', viewName);
      if (fs.existsSync(addonViewPath)) {
        return originalRenderFile(addonViewPath, data, options, callback);
      }
    }

    const mainViewPath = path.join(viewsPath, viewName);
    if (fs.existsSync(mainViewPath)) {
      return originalRenderFile(mainViewPath, data, options, callback);
    }

    return originalRenderFile(file, data, options, callback);
  } catch (error) {
    logger.error('Error in EJS renderFile override:', error);
    return originalRenderFile(file, data, options, callback);
  }
};

// Load compression
app.use(compression());

// Security middleware
app.use(
  helmet({
    noSniff: true,
    frameguard: { action: 'deny' },
    contentSecurityPolicy:
      process.env.NODE_ENV === 'production' ? undefined : false,
  }),
);
app.use(hpp());

// IP ban middleware — checked before rate limiting
app.use(async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!settings) return next();

    let banned: string[] = [];
    try {
      banned = JSON.parse(settings.bannedIps || '[]');
    } catch {
      banned = [];
    }

    const clientIp = req.ip || req.socket.remoteAddress || '';
    if (banned.includes(clientIp)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  } catch {
    // DB not ready yet — allow through
  }
  next();
});

// Dynamic rate limiter — window and max read from DB on each request
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: async () => {
      try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!settings || !settings.rateLimitEnabled) return 0; // 0 = disabled in express-rate-limit
        return settings.rateLimitRpm;
      } catch {
        return 100;
      }
    },
    skip: async (req) => {
      try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        return !settings?.rateLimitEnabled;
      } catch {
        return false;
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Load session with Prisma store
const isProduction = process.env.NODE_ENV === 'production';
const useSecureCookie =
  isProduction || (process.env.URL?.startsWith('https://') ?? false);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET || Math.random().toString(36).substring(2, 15),
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(),
    cookie: {
      secure: useSecureCookie,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 3600000 * 72, // 3 days
    },
  }),
);

app.use(
  express.json({
    limit: '100mb',
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: '100mb',
    parameterLimit: 100000,
  }),
);
app.use(
  express.raw({
    limit: '100mb',
  }),
);
app.use(
  express.text({
    limit: '100mb',
  }),
);

// Load cookies
app.use(cookieParser());

// Load translation
app.use(translationMiddleware);

// SPA middleware for detecting AJAX requests
app.use(spaMiddleware);

// Apply CSRF protection to all routes except for API routes and WebSocket routes
app.use((req, res, next) => {
  // Skip CSRF protection for WebSocket routes and API routes
  if (req.path.startsWith('/ws') || req.path.startsWith('/api/')) {
    return next();
  }
  csrfProtection(req, res, next);
});

// Handle CSRF errors
app.use(handleCsrfError);

// Add CSRF token to response locals for templates
app.use(addCsrfTokenToLocals);

interface SidebarItem {
  id: string;
  label: string;
  link: string;
}

interface GlobalWithCustomProperties extends NodeJS.Global {
  uiComponentStore: typeof import('./handlers/uiComponentHandler').uiComponentStore;
  appName: string;
  airlinkVersion: string;
  adminMenuItems: SidebarItem[];
  regularMenuItems: SidebarItem[];
}

declare const global: GlobalWithCustomProperties;

app.use((_req, res, next) => {
  res.locals.name = name;
  res.locals.airlinkVersion = airlinkVersion;
  global.uiComponentStore = uiComponentStore;
  global.appName = name;
  global.airlinkVersion = airlinkVersion;

  res.locals.adminMenuItems = uiComponentStore.getSidebarItems(undefined, true);
  res.locals.regularMenuItems = uiComponentStore.getSidebarItems(
    undefined,
    false,
  );

  const viewportCookie = (_req as any).cookies?.viewport_mode;
  const isMobileViewport = viewportCookie === 'mobile';
  res.locals.isMobileViewport = isMobileViewport;

  const originalRenderBase = res.render.bind(res);
  res.render = function (view: string, options?: any, callback?: any) {
    const isAbsolutePath = path.isAbsolute(view);
    const isAddonView = view.includes('/storage/addons/') || view.includes('\\storage\\addons\\');

    if (isAbsolutePath || isAddonView) {
      const data = { ...res.locals, ...(typeof options === 'object' ? options : {}) };
      (ejs as any).renderFile(view, data, {}, (err: any, html: string) => {
        if (err) {
          if (typeof callback === 'function') return callback(err);
          return (res as any).status(500).send('View render error: ' + err.message);
        }
        if (typeof callback === 'function') return callback(null, html);
        (res as any).send(html);
      });
      return;
    }

    const prefix = isMobileViewport ? 'mobile/' : 'desktop/';
    const prefixedView =
      view.startsWith('desktop/') || view.startsWith('mobile/')
        ? view
        : prefix + view;

    const prefixedViewPath = path.join(viewsPath, prefixedView + '.ejs');
    if (!fs.existsSync(prefixedViewPath) && !view.startsWith('desktop/') && !view.startsWith('mobile/')) {
      for (const addonDir of getAddonDirs()) {
        const viewportSubdir = isMobileViewport ? 'mobile' : 'desktop';
        const addonViewportPath = path.join(addonViewsDir, addonDir, 'views', viewportSubdir, view + '.ejs');
        const addonFallbackPath = path.join(addonViewsDir, addonDir, 'views', view + '.ejs');
        const addonViewPath = fs.existsSync(addonViewportPath) ? addonViewportPath : addonFallbackPath;
        if (fs.existsSync(addonViewPath)) {
          const data = { ...res.locals, ...(typeof options === 'object' ? options : {}) };
          (ejs as any).renderFile(addonViewPath, data, {}, (err: any, html: string) => {
            if (err) {
              if (typeof callback === 'function') return callback(err);
              return (res as any).status(500).send('View render error: ' + err.message);
            }
            if (typeof callback === 'function') return callback(null, html);
            (res as any).send(html);
          });
          return;
        }
      }
    }

    return originalRenderBase(prefixedView, options, callback);
  };

  const renderWithViewport = res.render;
  res.render = handleSPAPageRequest(renderWithViewport);

  next();
});

// Load error handling
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  if (!res.headersSent) {
    const errorMessage = isProduction ? 'Internal server error' : err.message;

    res.status(500).json({
      error: errorMessage,
    });
  }

  next(err);
});

// Load modules, plugins, database and start the webserver
(async () => {
  try {
    await databaseLoader();
    await settingsLoader();
    // Install HMAC signing interceptor for all panel→daemon requests
    installDaemonRequestInterceptor();
    // Initialize default UI components
    initializeDefaultUIComponents();
    await loadModules(app, airlinkVersion, Number(port));
    await loadAddons(app);

    // Setup SPA routes
    setupSPARoutes(app);

    const server = app.listen(port, () => {
      startPlayerStatsCollection();
      // Clone/pull egg repos on startup; auto-refreshes every 2 days
      initEggCatalogue().catch(err => logger.warn(`Store catalogue init failed: ${err?.message || err}`));
    });

    let shuttingDown = false;

    async function shutdown(signal: string) {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.info(`Shutting down (${signal})...`);

      server.close(async () => {
        try {
          await prisma.$disconnect();
        } catch {
          // best effort
        }
        logger.info('Server closed');
        process.exit(0);
      });

      // If server.close() doesn't finish within 10s, force exit
      setTimeout(() => {
        logger.warn('Forced exit after timeout');
        process.exit(1);
      }, 10_000).unref();
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to load modules or database:', err);
  }
})();

export default app;
