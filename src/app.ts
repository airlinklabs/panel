/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/airlink
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import express from 'express';
import path from 'path';
import session from 'express-session';
import { loadEnv } from './handlers/envLoader';
import { loadModules } from './handlers/modulesLoader';
import logger from './handlers/logger';
import config from './storage/config.json';
import cookieParser from 'cookie-parser';
import { translationMiddleware } from './handlers/translation';
loadEnv();

const app = express();
const port = process.env.PORT || 3000;
const airlinkVersion = config.meta.version;

// Load static files
app.use(express.static(path.join(__dirname, 'public')));

// Load views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: true,
  }),
);

// Load body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Load cookies
app.use(cookieParser());

// Load translation
app.use(translationMiddleware);

// Load modules
loadModules(app, airlinkVersion)
  .then(() => {
    app.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    logger.error('Failed to load modules:', err);
  });

export default app;
