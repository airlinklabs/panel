import { Request, Response, NextFunction } from 'express';
import prisma from '../db';
import logger from './logger';

type ErrorPageInfo = {
  title: string;
  message: string;
};

const DEFAULT_SETTINGS = {
  title: 'Airlink',
  favicon: '/favicon.ico',
  logo: '/assets/logo.png',
  lightTheme: 'default',
  darkTheme: 'default',
};

const ERROR_INFO: Record<number, ErrorPageInfo> = {
  400: {
    title: 'Bad request',
    message: 'The request could not be understood by the panel.',
  },
  401: {
    title: 'Sign in required',
    message: 'Your session is missing or has expired.',
  },
  403: {
    title: 'Not your territory',
    message: 'You don\'t have access here. If that\'s wrong, your admin can fix it.',
  },
  404: {
    title: 'Fell off the map',
    message: 'This page doesn\'t exist, or it did and we broke it.',
  },
  405: {
    title: 'Method not allowed',
    message: 'This page does not support that request method.',
  },
  408: {
    title: 'Request timeout',
    message: 'The request took too long to complete.',
  },
  409: {
    title: 'Conflict',
    message: 'The request conflicts with the current panel state.',
  },
  413: {
    title: 'Payload too large',
    message: 'The uploaded data is larger than the panel accepts.',
  },
  429: {
    title: 'Too many requests',
    message: 'Slow down and try again in a moment.',
  },
  500: {
    title: 'We tripped',
    message: 'Something broke on our end. It\'s logged. We\'re probably already embarrassed.',
  },
  502: {
    title: 'Bad gateway',
    message: 'The panel could not get a valid response from an upstream service.',
  },
  503: {
    title: 'Service unavailable',
    message: 'The panel or daemon is not available right now.',
  },
  504: {
    title: 'Gateway timeout',
    message: 'An upstream service took too long to respond.',
  },
};

function wantsJson(req: Request): boolean {
  return (
    req.path.startsWith('/api/') ||
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    req.accepts(['html', 'json']) === 'json'
  );
}

function normalizeStatus(status: unknown): number {
  const parsed = Number(status);
  if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
    return parsed;
  }
  return 500;
}

function getCookieValue(req: Request, name: string): string | undefined {
  const parsedCookies = req.cookies;
  if (parsedCookies?.[name]) return parsedCookies[name];

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return [part, ''];
      return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
    })
    .find(([key]) => key === name)?.[1];
}

function getErrorView(req: Request): string {
  return getCookieValue(req, 'viewport_mode') === 'mobile'
    ? 'mobile/errors/error'
    : 'desktop/errors/error';
}

async function getErrorRenderData(req: Request, statusCode: number, detail?: string) {
  const userId = req.session?.user?.id;
  const [settings, user] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null),
    userId ? prisma.users.findUnique({ where: { id: userId } }).catch(() => null) : Promise.resolve(null),
  ]);
  const info = ERROR_INFO[statusCode] || {
    title: `Error ${statusCode}`,
    message: 'The panel could not complete this request.',
  };

  return {
    req,
    settings: settings || DEFAULT_SETTINGS,
    user,
    title: `${statusCode} ${info.title}`,
    statusCode,
    errorTitle: info.title,
    errorMessage: detail || info.message,
    path: req.originalUrl,
  };
}

export async function renderErrorPage(
  req: Request,
  res: Response,
  statusCode: number,
  detail?: string,
) {
  const normalizedStatus = normalizeStatus(statusCode);
  const info = ERROR_INFO[normalizedStatus] || {
    title: `Error ${normalizedStatus}`,
    message: 'The panel could not complete this request.',
  };
  const message = detail || info.message;

  // If user is not authenticated and not requesting JSON, redirect to login
  const isAuthenticated = req.session?.user?.id;
  if (!isAuthenticated && !wantsJson(req)) {
    return res.redirect('/login');
  }

  if (wantsJson(req)) {
    return res.status(normalizedStatus).json({
      error: info.title,
      message,
      statusCode: normalizedStatus,
    });
  }

  try {
    const data = await getErrorRenderData(req, normalizedStatus, detail);
    return res.status(normalizedStatus).render(getErrorView(req), data);
  } catch (renderError) {
    logger.error('Failed to render error page:', renderError);
    return res.status(normalizedStatus).send(`${normalizedStatus} ${info.title}`);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  return renderErrorPage(req, res, 404);
}

export function errorPageHandler(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = normalizeStatus(err.status || err.statusCode);
  logger.error('Unhandled error:', err);
  const detail = process.env.NODE_ENV === 'production' ? undefined : err.message;
  return renderErrorPage(req, res, statusCode, detail);
}
