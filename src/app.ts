/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/airlink
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
import { loadPlugins } from './handlers/pluginHandler';

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
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
//app.set('view options', {
//  compileDebug: process.env.NODE_ENV === 'development',
//});

// Load compression
app.use(compression());

// Load session with Prisma store
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || Math.random().toString(36).substring(2, 15),
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: process.env.URL
        ? process.env.URL.startsWith('https://')
        : false,
      sameSite: 'strict',
      maxAge: 3600000 * 72, // 3 days
    },
  }),
);

// Load body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Load cookies
app.use(cookieParser());

// Load translation
app.use(translationMiddleware);

// Load locals
app.use((req, res, next) => {
  res.locals.name = name;
  res.locals.airlinkVersion = airlinkVersion;
  next();
});

// Load error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  if (!res.headersSent) {
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
    });
  }

  next(err);
});

// Load modules, plugins, database and start the webserver
databaseLoader()
  .then(async () => {
    await settingsLoader();
    return loadModules(app, airlinkVersion).then(async () => {
      loadPlugins(app);
    });
  })
  .then(() => {
    app.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    logger.error('Failed to load modules or database:', err);
  });

export default app;
