import type { Request, Response, NextFunction } from 'express';
import express from 'express';
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
import rateLimit from 'express-rate-limit';
import icon from './utils/icon';
import { getClientIp } from './utils/ip';
// hpp removed: Express 5's req.query parsing (qs with arrayLimit: 0) already
// prevents HTTP Parameter Pollution. No replacement needed.
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

import { getConfig } from './config';
import { installRenderResolver } from './handlers/renderResolver';
import { validationErrorBoundary } from './utils/validation';

loadEnv();

// Set max listeners
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

app.use(
  '/vendor/xterm',
  express.static(path.join(__dirname, '../node_modules', '@xterm/xterm/css')),
);

app.use(
  '/vendor/xterm/lib',
  express.static(path.join(__dirname, '../node_modules', '@xterm/xterm/lib')),
);

app.use(
  '/vendor/marked',
  express.static(path.join(__dirname, '../node_modules', 'marked/lib')),
);

app.use(
  '/vendor/xterm-addon-fit',
  express.static(path.join(__dirname, '../node_modules', '@xterm/addon-fit/lib')),
);

app.use(
  '/vendor/xterm-addon-web-links',
  express.static(path.join(__dirname, '../node_modules', '@xterm/addon-web-links/lib')),
);

app.use(
  '/vendor/chartjs',
  express.static(path.join(__dirname, '../node_modules', 'chart.js/dist')),
);

// Load views
const viewsPath = path.join(__dirname, '../views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

// The global ejs.renderFile monkey-patch used to live here, falling back to
// addon views for any missing template. It has been replaced by the explicit
// addon view resolver (src/handlers/addonViewResolver.ts), which validates
// addon slugs and keeps every resolved path inside the addon's views dir.

const addonViewsDir = path.join(__dirname, '../../storage/addons');

// Load compression
app.use(compression());

// =============================================================================
// Security middleware
// =============================================================================
const isHttps = panelConfig.isHttps;
const isProduction = panelConfig.isProduction;

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
// X-Request-Id middleware — propagates a stable request identifier from
// browser → panel → daemon for distributed tracing. If the browser sends
// one we honor it; otherwise we generate a new UUID.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  const requestId = (typeof incoming === 'string' && incoming.trim()) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// ---------------------------------------------------------------------------
// Helmet — configured explicitly rather than using defaults so we control
// every header precisely across both HTTP and HTTPS deployments.
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = res.locals.nonce as string;

  // All assets are now served locally — no CDN domains needed in CSP.
  // This significantly tightens security by only allowing self-hosted resources.

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
          scriptSrc: [
            '\'self\'',
            `'nonce-${nonce}'`,
            '\'strict-dynamic\'',
          ],

          // Inline event handlers (onclick, onchange, etc.) cannot carry nonces.
          // 'unsafe-inline' here is scoped only to attributes, not to <script>
          // blocks (which are governed by scriptSrc above).
          // This is the minimum needed to avoid rewriting 126+ EJS event handlers.
          scriptSrcAttr: ['\'unsafe-inline\''],

          // Styles — allow inline (Tailwind utility classes are inline by nature)
          // plus the exact external stylesheet CDNs used.
          styleSrc: ['\'self\'', '\'unsafe-inline\''],

          fontSrc: ['\'self\'', 'data:'],

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

import { refreshSecurityCache, getSecurityCache } from './handlers/securityCache';

// Initial load + refresh every 30 seconds
refreshSecurityCache();
setInterval(refreshSecurityCache, 30_000);

// IP ban middleware — uses cached list, no per-request DB hit
app.use((req, res, next) => {
  const clientIp = getClientIp(req);
  if (getSecurityCache().bannedIps.includes(clientIp)) {
    renderErrorPage(req, res, 403, 'Your IP address is blocked from this panel.');
    return;
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
  }),
);

// Load session with Prisma store
// Only mark cookies as secure when the server is actually serving over HTTPS.
// Setting secure:true on a plain HTTP server causes browsers to silently drop
// all session cookies, breaking login on local network setups.
const useSecureCookie = panelConfig.isHttps;

// Session secret comes from the validated config (src/config.ts). The panel
// never writes secrets to .env at runtime; use `node dist/cli/secret.js`.
const sessionSecret = panelConfig.sessionSecret;

app.use(
  session({
    secret: sessionSecret,
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

// Apply CSRF protection to all routes except WebSocket upgrades and the
// bearer-only API mounts. Session-authenticated /api/* routes (folders,
// admin endpoints, search) ARE protected — see csrfRouting.ts.
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

app.use((_req, res, next) => {
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

  next();
});

// Explicit primary/addon view resolver — replaces the old global EJS
// monkey-patch and the inline res.render override (see renderResolver.ts).
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
    await databaseLoader();
    await settingsLoader();
    // Initialize default UI components
    initializeDefaultUIComponents();
    await loadModules(app, airlinkVersion, Number(port), expressWsInstance);
    setAppInstance(app);
    await loadAddons(app);

    // Consistent request-validation boundary: converts schema failures from
    // any feature into a standardized 400 response (see src/utils/validation.ts).
    app.use(validationErrorBoundary);

    app.use(notFoundHandler);
    app.use(errorPageHandler);

    const server = app.listen(port, () => {
      startPlayerStatsCollection();
      startScheduler();
      reenqueueQueuedInstalls();
      // Clone/pull egg repos on startup; auto-refreshes every 2 days
      initEggCatalogue().catch(err => logger.warn(`Store catalogue init failed: ${err?.message || err}`));
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
