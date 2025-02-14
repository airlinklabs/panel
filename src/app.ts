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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import coreModule from './modules/core';





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
app.use(express.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
//app.set('view options', {
//  compileDebug: process.env.NODE_ENV === 'development',
//});

// Load compression
app.use(compression());

// Load security headers
app.use(helmet.noSniff());
app.use(helmet.frameguard({ action: 'deny' }));

// Load rate limiter
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
});

app.use(limiter);

// API-specific rate limiter
const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiter to API routes
app.use('/api', apiRateLimiter);

// Add CORS for API routes
app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Load hpp protection
app.use(hpp());

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

// API v1 routes
app.use('/api/v1', apiV1Router);

// Update API documentation route
app.get('/api/docs', (_req: Request, res: Response): void => {
  res.render('admin/settings/api-docs', {
    endpoints: [
      {
        path: '/api/v1/allocations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server allocations'
      },
      {
        path: '/api/v1/databases',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server databases'
      },
      {
        path: '/api/v1/images',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server images'
      },
      {
        path: '/api/v1/locations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server locations'
      },
      {
        path: '/api/v1/nests',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server nests'
      },
      {
        path: '/api/v1/nodes',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage server nodes'
      },
      {
        path: '/api/v1/servers',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage servers'
      },
      {
        path: '/api/v1/users',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage users'
      },
      {
        path: '/api/v1/keys',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Manage API keys (Admin only)'
      }
    ]
  });
});

// Load translation middleware first
app.use(translationMiddleware);

// Load locals after translation middleware
app.use((req, res, next) => {
  res.locals.name = name;
  res.locals.airlinkVersion = airlinkVersion;
  res.locals.translations = (req as any).translations; // Add translations to locals
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
