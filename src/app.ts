/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
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
import { initializeDefaultUIComponents, uiComponentStore } from './handlers/uiComponentHandler';
import { startPlayerStatsCollection } from './handlers/playerStatsCollector';
import { createPlayerStatsTable } from './handlers/createPlayerStatsTable';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import fs from 'fs';
import csrfProtection, { handleCsrfError, addCsrfTokenToLocals } from './handlers/utils/security/csrfProtection';
import { spaMiddleware, handleSPAPageRequest, setupSPARoutes } from './handlers/spaHandler';

loadEnv();

// Set max listeners
process.setMaxListeners(20);

const app = express();
const port = process.env.PORT || 3000;
const name = process.env.NAME || 'AirLink';
const airlinkVersion = config.meta.version;

// Load websocket
expressWs(app);

// Load static files
app.use(express.static(path.join(__dirname, '../public')));

// Load views
const viewsPath = path.join(__dirname, '../views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

const ejs = require('ejs');
const originalRenderFile = ejs.renderFile;

ejs.renderFile = function(file: string, data: any, options: any, callback: any) {
  try {
    if (fs.existsSync(file)) {
      return originalRenderFile(file, data, options, callback);
    }

    const viewName = path.basename(file);
    const addonViewsDir = path.join(__dirname, '../../storage/addons');

    if (fs.existsSync(addonViewsDir)) {
      const addonDirs = fs.readdirSync(addonViewsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const addonDir of addonDirs) {
        const addonViewPath = path.join(addonViewsDir, addonDir, 'views', viewName);
        if (fs.existsSync(addonViewPath)) {
          return originalRenderFile(addonViewPath, data, options, callback);
        }
      }
    }
    const mainViewPath = path.join(viewsPath, viewName);
    if (fs.existsSync(mainViewPath)) {
      return originalRenderFile(mainViewPath, data, options, callback);
    }

    return originalRenderFile(file, data, options, callback);
  } catch (error) {
    console.error('Error in EJS renderFile override:', error);
    return originalRenderFile(file, data, options, callback);
  }
};

// Load compression
app.use(compression());

// Security middleware
app.use(helmet({
  noSniff: true,
  frameguard: { action: 'deny' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));
app.use(hpp());
app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
}));

// Load session with Prisma store
const isProduction = process.env.NODE_ENV === 'production';
const useSecureCookie = isProduction || (process.env.URL?.startsWith('https://') ?? false);

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

app.use(express.json({
  limit: '100mb'
}));
app.use(express.urlencoded({
  extended: true,
  limit: '100mb',
  parameterLimit: 100000
}));
app.use(express.raw({
  limit: '100mb'
}));
app.use(express.text({
  limit: '100mb'
}));

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
  res.locals.regularMenuItems = uiComponentStore.getSidebarItems(undefined, false);

  // Override res.render for SPA support
  const originalRender = res.render;
  res.render = handleSPAPageRequest(originalRender);

  next();
});

// Load error handling
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  if (!res.headersSent) {
    const errorMessage = isProduction ? 'Internal server error' : err.message;

    res.status(500).json({
      error: errorMessage
    });
  }

  next(err);
});

// Load modules, plugins, database and start the webserver
(async () => {
  try {
    await databaseLoader();
    await settingsLoader();
    // Initialize default UI components
    initializeDefaultUIComponents();
    await loadModules(app, airlinkVersion, Number(port));
    await loadAddons(app);

    // Setup SPA routes
    setupSPARoutes(app);

    const server = app.listen(port, () => {
      // Create PlayerStats table and start collection
      createPlayerStatsTable().then(() => {
        startPlayerStatsCollection();
      });
    });

    // on close of the application
    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      // database close
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      prisma.$disconnect();
      // server close
      server.close(() => {
        logger.info('Server closed');
      });
    });
  } catch (err) {
    logger.error('Failed to load modules or database:', err);
  }
})();

export default app;
