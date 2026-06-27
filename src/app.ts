/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2025 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import prisma from './db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { loadEnv } from './config/env.js';
import { databaseLoader } from './loaders/database.js';
import { loadModules } from './loaders/modules.js';
import logger from './services/logger.js';
import cookieParser from 'cookie-parser';
import expressWs from 'express-ws';
import compression from 'compression';
import { translationMiddleware } from './services/translation.js';
import PrismaSessionStore from './services/session.js';
import { settingsLoader } from './config/settings.js';
import { loadAddons, setAppInstance } from './addons/handler.js';
import {
  setupUIComponents,
  uiComponentStore,
} from './core/uiComponents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { installDaemonRequestInterceptor } from './services/daemonRequest.js';
installDaemonRequestInterceptor();
import { startPlayerStatsCollection } from './services/playerStats.js';
import { initEggCatalogue } from './services/eggCatalog.js';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import icon from './utils/icon.js';
// hpp removed: Express 5's req.query parsing (qs with arrayLimit: 0) already
// prevents HTTP Parameter Pollution. No replacement needed.
import csrfProtection, {
  handleCsrfError,
  addCsrfTokenToLocals,
} from './middleware/csrf.js';
import { flashToastMiddleware } from './middleware/flashToast.js';
import {
  errorPageHandler,
  notFoundHandler,
  renderErrorPage,
} from './middleware/errorHandler.js';


loadEnv();

// Purge expired sessions from the database
async function purgeExpiredSessions() {
  try {
    await prisma.session.deleteMany({ where: { expires: { lt: new Date() } } });
  } catch {
    // Best effort — session table may not exist yet during initial setup
  }
}

// Set max listeners
process.setMaxListeners(20);

const app = express();
const port = process.env.PORT || 3000;
const name = process.env.NAME || 'AirLink';
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../storage/config.json'), 'utf-8')) as { meta: { version: string } };
const airlinkVersion = config.meta.version;

// Trust proxy — sync env var takes precedence; async DB read fills in if not set.
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Async DB read for trust proxy (fallback if env var not set)
;void (async () => {
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

const ejsModule = ejs as unknown as {
  renderFile?: typeof ejs.renderFile;
  __express?: typeof ejs.renderFile;
};
const originalRenderFile = (ejsModule.renderFile || ejsModule.__express)!.bind(ejs);

const addonViewsDir = path.join(__dirname, '../../storage/addons');

function getAddonDirs(): string[] {
  if (!fs.existsSync(addonViewsDir)) {return [];}
  return fs
    .readdirSync(addonViewsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

// @ts-expect-error - extending renderFile with addon-aware resolution
(ejs as unknown as { renderFile: typeof ejs.renderFile }).renderFile = function (
  file: string,
  data: Record<string, unknown>,
  optionsOrCallback: Record<string, unknown> | ((err: Error | null, html?: string) => void),
  maybeCallback?: (err: Error | null, html?: string) => void,
) {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  try {
    if (fs.existsSync(file)) {
      originalRenderFile(file, data, options, callback!); return;
    }

    const viewName = path.basename(file);

    if (data?.addonSlug) {
      const addonViewPath = path.join(addonViewsDir, String(data.addonSlug), 'views', viewName);
      if (fs.existsSync(addonViewPath)) {
        originalRenderFile(addonViewPath, data, options, callback!); return;
      }
    }

    const mainViewPath = path.join(viewsPath, viewName);
    if (fs.existsSync(mainViewPath)) {
      originalRenderFile(mainViewPath, data, options, callback!); return;
    }

    for (const addonDir of getAddonDirs()) {
      if (data?.addonSlug && addonDir === data.addonSlug) {continue;}
      const addonViewPath = path.join(addonViewsDir, addonDir, 'views', viewName);
      if (fs.existsSync(addonViewPath)) {
        originalRenderFile(addonViewPath, data, options, callback!); return;
      }
    }

    originalRenderFile(file, data, options, callback!); return;
  } catch (error) {
    logger.error('Error in EJS renderFile override:', error);
    originalRenderFile(file, data, options, callback!); return;
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

import { refreshSecurityCache, getSecurityCache } from './services/security.js';

// Initial load + refresh every 30 seconds
void refreshSecurityCache();
setInterval(refreshSecurityCache, 30_000);

// IP ban middleware — uses cached list, no per-request DB hit
app.use((req, res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  if (getSecurityCache().bannedIps.includes(clientIp)) {
    return renderErrorPage(req, res, 403, 'Your IP address is blocked from this panel.');
  }
  next();
});

// Rate limiter — uses cached settings, no per-request DB hit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: () => { const c = getSecurityCache(); return c.rateLimitEnabled ? c.rateLimitRpm : 0; },
    skip: () => !getSecurityCache().rateLimitEnabled,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
  }),
);

// Load session with Prisma store
// Only mark cookies as secure when the server is actually serving over HTTPS.
// Setting secure:true on a plain HTTP server causes browsers to silently drop
// all session cookies, breaking login on local network setups.
const useSecureCookie = process.env.URL?.startsWith('https://') ?? false;
const sessionCookieName = process.env.NODE_ENV === 'production' ? '__Host-sid' : 'sid';
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET env var must be set in production.');
}

app.use(
  session({
    secret: sessionSecret || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    name: sessionCookieName,
    store: new PrismaSessionStore(),
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

// Apply CSRF protection to all routes except for API routes and WebSocket routes
app.use((req, res, next) => {
  // Skip CSRF protection for WebSocket routes and API routes
  if (req.path.startsWith('/ws') || req.path.startsWith('/api/')) {
    next(); return;
  }
  csrfProtection(req, res, next);
});

// Add CSRF token to view locals
app.use((req, res, next) => {
  if (req.path.startsWith('/ws') || req.path.startsWith('/api/')) {
    next(); return;
  }
  addCsrfTokenToLocals(req, res, next);
});

app.use(handleCsrfError);

// Flash toast support — req.flashToast('msg', 'type') before res.redirect()
app.use(flashToastMiddleware);

interface GlobalWithCustomProperties extends NodeJS.Global {
  uiComponentStore: {
    getSidebarItems: (section?: string, isAdmin?: boolean) => {
      id: string;
      label: string;
      icon: string;
      url: string;
      priority: number;
      isAddon?: boolean;
      matchPrefix?: string;
    }[];
  };
  appName: string;
  airlinkVersion: string;
  adminMenuItems: { id: string; label: string; icon: string; url: string }[];
  regularMenuItems: { id: string; label: string; icon: string; url: string }[];
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

  const viewportCookie = (_req.cookies as Record<string, string> | undefined)?.viewport_mode;
  const isMobileViewport = viewportCookie === 'mobile';
  res.locals.isMobileViewport = isMobileViewport;

  const originalRenderBase = res.render.bind(res);
  // @ts-expect-error - custom render wrapper with extended callback signature
  res.render = function (view: string, optionsOrCb?: Record<string, unknown> | ((err: Error | null, html?: string) => void), maybeCb?: (err: Error | null, html?: string) => void): void {
    const isAbsolutePath = path.isAbsolute(view);
    const isAddonView = view.includes('/storage/addons/') || view.includes('\\storage\\addons\\');

    const resolvedCb: ((err: Error | null, html?: string) => void) | undefined = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
    const opts = typeof optionsOrCb === 'function' ? {} : optionsOrCb || {};

    if (isAbsolutePath || isAddonView) {
      const data = { ...res.locals, ...(typeof opts === 'object' ? opts : {}) };
      (ejs as unknown as { renderFile: typeof ejs.renderFile }).renderFile(view, data, {}, (err: Error | null, html: string) => {
        if (err) {
          if (typeof resolvedCb === 'function') {resolvedCb(err); return;}
          return res.status(500).send('View render error: ' + err.message);
        }
        if (typeof resolvedCb === 'function') {resolvedCb(null, html); return;}
        res.send(html);
      });
      return;
    }

    // Views now live at views/ root. isMobileViewport is in res.locals for templates.
    const rootViewPath = path.join(viewsPath, view + '.ejs');
    const legacyDesktopPath = path.join(viewsPath, 'desktop/' + view + '.ejs');
    const legacyMobilePath  = path.join(viewsPath, 'mobile/'  + view + '.ejs');

    let resolvedView = view;
    if (!fs.existsSync(rootViewPath)) {
      if (fs.existsSync(legacyDesktopPath)) {
        resolvedView = 'desktop/' + view;
      } else if (fs.existsSync(legacyMobilePath)) {
        resolvedView = 'mobile/' + view;
      }
      // If none exist, Express throws "view not found" — correct behaviour.
    }

    // Addon view fallback (unchanged)
    if (!fs.existsSync(path.join(viewsPath, resolvedView + '.ejs'))) {
      const optsRecord = opts;
      if (optsRecord.addonSlug) {
        const addonSlug = optsRecord.addonSlug as string;
        const addonFallbackPath = path.join(addonViewsDir, addonSlug, 'views', view + '.ejs');
        if (fs.existsSync(addonFallbackPath)) {
          const data = { ...res.locals, ...(typeof opts === 'object' ? opts : {}) };
          (ejs as unknown as { renderFile: typeof ejs.renderFile }).renderFile(addonFallbackPath, data, {}, (err: Error | null, html: string) => {
            if (err) {
              if (typeof resolvedCb === 'function') {resolvedCb(err); return;}
              return res.status(500).send('View render error: ' + err.message);
            }
            if (typeof resolvedCb === 'function') {resolvedCb(null, html); return;}
            res.send(html);
          });
          return;
        }
      }

      for (const addonDir of getAddonDirs()) {
        if (optsRecord.addonSlug && addonDir === optsRecord.addonSlug) {continue;}
        const addonFallbackPath = path.join(addonViewsDir, addonDir, 'views', view + '.ejs');
        if (fs.existsSync(addonFallbackPath)) {
          const data = { ...res.locals, ...(typeof opts === 'object' ? opts : {}) };
          (ejs as unknown as { renderFile: typeof ejs.renderFile }).renderFile(addonFallbackPath, data, {}, (err: Error | null, html: string) => {
            if (err) {
              if (typeof resolvedCb === 'function') {resolvedCb(err); return;}
              return res.status(500).send('View render error: ' + err.message);
            }
            if (typeof resolvedCb === 'function') {resolvedCb(null, html); return;}
            res.send(html);
          });
          return;
        }
      }
    }

    originalRenderBase(resolvedView, opts, resolvedCb);
  };

  next();
});

// Catch errors from global middleware registered before modules.
app.use(errorPageHandler);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
  skip: (req) => process.env.NODE_ENV === 'test',
});

app.use('/login', authLimiter);
app.use('/register', authLimiter);

// Load modules, plugins, database and start the webserver
void (async () => {
  try {
    await databaseLoader();
    await settingsLoader();
    setupUIComponents();
    await loadModules(app, airlinkVersion, Number(port), expressWsInstance);
    setAppInstance(app);
    await loadAddons(app);

    app.use(notFoundHandler);
    app.use(errorPageHandler);

    const server = app.listen(port, () => {
      startPlayerStatsCollection();
      // Clone/pull egg repos on startup; auto-refreshes every 2 days
      initEggCatalogue().catch(err => { logger.warn(`Store catalogue init failed: ${err?.message || err}`); });
      // Purge expired sessions at startup, then every 6 hours
      void purgeExpiredSessions();
      setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000);
    });

    let shuttingDown = false;

    async function shutdown(signal: string) {
      if (shuttingDown) {return;}
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
