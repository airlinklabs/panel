/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2025 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express, { Request, Response, NextFunction } from 'express';
import prisma from './db';
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
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import icon from './utils/icon';
// hpp removed: Express 5's req.query parsing (qs with arrayLimit: 0) already
// prevents HTTP Parameter Pollution. No replacement needed.
import fs from 'fs';
import csrfProtection, {
  handleCsrfError,
  addCsrfTokenToLocals,
} from './handlers/utils/security/csrfProtection';
import {
  spaMiddleware,
  handleSPAPageRequest,
} from './handlers/spaHandler';
import {
  errorPageHandler,
  notFoundHandler,
  renderErrorPage,
} from './handlers/errorPages';


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
const expressWsInstance = expressWs(app);

// Load static files
app.use(express.static(path.join(__dirname, '../public')));

app.use(
  '/monaco',
  express.static(path.join(__dirname, '../node_modules', 'monaco-editor/min')),
);

app.use(
  '/vendor',
  express.static(path.join(__dirname, '../node_modules', '@formkit/auto-animate')),
);

// Load views
const viewsPath = path.join(__dirname, '../views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

import ejs from 'ejs';

const originalRenderFile = (ejs as any).renderFile
  ? (ejs as any).renderFile.bind(ejs)
  : (ejs as any).__express?.bind(ejs);

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

// =============================================================================
// Security middleware
// =============================================================================
const isHttps = process.env.URL?.startsWith('https://') ?? false;
const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Nonce middleware — runs before helmet so the nonce is available when we
// build the CSP header. A fresh cryptographically random nonce is generated
// for every single HTTP response. It is exposed as:
//   • res.locals.nonce  — used in EJS templates: <script nonce="<%- nonce %>">
//   • req.nonce         — available anywhere downstream if needed
// Every <script> block in the EJS templates MUST carry this nonce attribute.
// Scripts without a matching nonce are blocked by the browser even if they
// are served from 'self', which is exactly the XSS protection we want.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  req.nonce = nonce;
  next();
});

// ---------------------------------------------------------------------------
// Helmet — configured explicitly rather than using defaults so we control
// every header precisely across both HTTP and HTTPS deployments.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = res.locals.nonce as string;

  // External domains actually used by the templates:
  //   fonts:   api.fontshare.com, cdn.fontshare.com, fonts.googleapis.com
  //   scripts: cdn.jsdelivr.net, cdnjs.cloudflare.com
  //   styles:  cdn.jsdelivr.net (xterm.css)
  const cdnScripts = [
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
  ];
  const cdnStyles = [
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
  ];
  const cdnFonts = [
    'https://api.fontshare.com',
    'https://cdn.fontshare.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];

  helmet({
    // X-Content-Type-Options: nosniff
    noSniff: true,

    // X-Frame-Options is superseded by frame-ancestors in the CSP below,
    // but we keep it for legacy browsers that don't understand CSP.
    frameguard: { action: 'deny' },

    // HSTS — only sent over HTTPS. Sending it on HTTP is meaningless and
    // causes browsers to refuse future HTTP connections to the same host.
    hsts: isHttps
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,

    // Cross-Origin-Opener-Policy and Origin-Agent-Cluster are only meaningful
    // (and only safe from a browser-warning perspective) on HTTPS origins.
    crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
    originAgentCluster: isHttps ? undefined : false,

    // Referrer-Policy — don't leak the full URL to third-party CDNs.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Permissions-Policy — deny all sensitive browser APIs we don't use.
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    contentSecurityPolicy: isProduction
      ? {
        directives: {
          // Fallback for any directive not listed explicitly.
          defaultSrc: ['\'self\''],

          // Scripts:
          //   'nonce-{nonce}' — allows only <script nonce="…"> blocks that
          //                     carry the per-request nonce. Blocks all other
          //                     inline scripts and eval().
          //   'strict-dynamic' — lets nonce-carrying scripts load further
          //                     scripts dynamically (needed by Monaco loader).
          //                     When strict-dynamic is present, host allowlists
          //                     are ignored by supporting browsers, so the CDN
          //                     list here is a fallback for older browsers only.
          scriptSrc: [
            '\'self\'',
            `'nonce-${nonce}'`,
            '\'strict-dynamic\'',
            ...cdnScripts,
          ],

          // Inline event handlers (onclick, onchange, etc.) cannot carry nonces.
          // 'unsafe-inline' here is scoped only to attributes, not to <script>
          // blocks (which are governed by scriptSrc above).
          // This is the minimum needed to avoid rewriting 126+ EJS event handlers.
          scriptSrcAttr: ['\'unsafe-inline\''],

          // Styles — allow inline (Tailwind utility classes are inline by nature)
          // plus the exact external stylesheet CDNs used.
          styleSrc: ['\'self\'', '\'unsafe-inline\'', ...cdnStyles, ...cdnFonts],

          // Fonts — exact CDN origins only, plus data URIs for embedded icons.
          fontSrc: ['\'self\'', 'data:', ...cdnFonts],

          // Images — self + data URIs (avatars/favicons) + https for remote images.
          // http: is intentionally excluded; image URLs served by the daemon
          // should be proxied through the panel rather than loaded directly.
          imgSrc: ['\'self\'', 'data:', 'blob:', 'https:'],

          // WebSocket connections for the server console + same-origin API calls.
          connectSrc: [
            '\'self\'',
            ...(isHttps ? ['wss:'] : ['ws:', 'wss:']),
          ],

          // Prevent the panel from being embedded in any frame anywhere.
          // Supersedes X-Frame-Options for modern browsers.
          frameAncestors: ['\'none\''],

          // Prevent any plugins (Flash, PDF, etc.) from being embedded.
          objectSrc: ['\'none\''],

          // Lock down <base> tags — prevents base-tag hijacking attacks.
          baseUri: ['\'self\''],

          // All form submissions must go to same origin.
          formAction: ['\'self\''],

          // Only upgrade to HTTPS when we are actually serving HTTPS.
          // Without this guard, helmet's default adds upgrade-insecure-requests
          // which rewrites every asset URL to https://, breaking HTTP installs.
          ...(isHttps
            ? { upgradeInsecureRequests: [] }
            : { upgradeInsecureRequests: null }),
        },
      }
      : false,
  })(req, res, next);
});

// hpp removed: Express 5 handles parameter pollution natively

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
      return renderErrorPage(req, res, 403, 'Your IP address is blocked from this panel.');
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
    skip: async (_req) => {
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
// Only mark cookies as secure when the server is actually serving over HTTPS.
// Setting secure:true on a plain HTTP server causes browsers to silently drop
// all session cookies, breaking login on local network setups.
const useSecureCookie = process.env.URL?.startsWith('https://') ?? false;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET env var must be set in production.');
}

app.use(
  session({
    secret: sessionSecret || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(),
    cookie: {
      secure: useSecureCookie,
      httpOnly: true,
      sameSite: 'strict',
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

// Add CSRF token to view locals
app.use((req, res, next) => {
  if (req.path.startsWith('/ws') || req.path.startsWith('/api/')) {
    return next();
  }
  addCsrfTokenToLocals(req, res, next);
});

// Handle CSRF errors
app.use(handleCsrfError);

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
  res.locals.icon = icon;
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
  res.render = function (view: string, options?: Record<string, unknown> | ((err: Error | null, html?: string) => void), callback?: (err: Error | null, html?: string) => void) {
    const isAbsolutePath = path.isAbsolute(view);
    const isAddonView = view.includes('/storage/addons/') || view.includes('\\storage\\addons\\');

    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const opts = options || {};

    if (isAbsolutePath || isAddonView) {
      const data = { ...res.locals, ...(typeof opts === 'object' ? opts : {}) };
      (ejs as any).renderFile(view, data, {}, (err: Error | null, html: string) => {
        if (err) {
          if (typeof callback === 'function') return callback(err);
          return res.status(500).send('View render error: ' + err.message);
        }
        if (typeof callback === 'function') return callback(null, html);
        res.send(html);
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
          const data = { ...res.locals, ...(typeof opts === 'object' ? opts : {}) };
          (ejs as any).renderFile(addonViewPath, data, {}, (err: Error | null, html: string) => {
            if (err) {
              if (typeof callback === 'function') return callback(err);
              return res.status(500).send('View render error: ' + err.message);
            }
            if (typeof callback === 'function') return callback(null, html);
            res.send(html);
          });
          return;
        }
      }
    }

    return originalRenderBase(prefixedView, opts, callback);
  };

  const renderWithViewport = res.render;
  res.render = handleSPAPageRequest(renderWithViewport);

  next();
});

// Catch errors from global middleware registered before modules.
app.use(errorPageHandler);

// Load modules, plugins, database and start the webserver
(async () => {
  try {
    await databaseLoader();
    await settingsLoader();
    // Install HMAC signing interceptor for all panel→daemon requests
    installDaemonRequestInterceptor();
    // Initialize default UI components
    initializeDefaultUIComponents();
    await loadModules(app, airlinkVersion, Number(port), expressWsInstance);
    await loadAddons(app);

    app.use(notFoundHandler);
    app.use(errorPageHandler);

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
