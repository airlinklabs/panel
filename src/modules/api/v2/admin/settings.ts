/**
 * V2 API — Admin settings endpoints.
 *
 * GET    /api/v2/admin/settings               — Get all settings
 * PATCH  /api/v2/admin/settings/general        — Update general settings
 * PATCH  /api/v2/admin/settings/security       — Update security settings
 * PATCH  /api/v2/admin/settings/server-policy  — Update server policy
 * PATCH  /api/v2/admin/settings/smtp           — Update SMTP settings
 * POST   /api/v2/admin/settings/smtp/test      — Test SMTP connection
 * PATCH  /api/v2/admin/settings/s3             — Update S3 settings
 * POST   /api/v2/admin/settings/s3/test        — Test S3 connection
 * POST   /api/v2/admin/settings/ban-ip         — Ban IP
 * POST   /api/v2/admin/settings/unban-ip       — Unban IP
 * POST   /api/v2/admin/settings/reset          — Reset settings to defaults
 * GET    /api/v2/admin/settings/example-theme  — Example theme archive
 */

import { Router } from 'express';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import { jsonOk, jsonError, requireAdmin, logActivity } from '../helpers';
import logger from '../../../../handlers/logger';
import { redisRateLimit } from '../../../../handlers/utils/security/redisRateLimit';
import { invalidateSettingsCache } from '../../../../handlers/settingsCache';
import AdmZip from 'adm-zip';
import {
  DEFAULT_LOGO_PATH,
  DEFAULT_FAVICON_PATH,
  DEFAULT_THEME,
  DEFAULT_LANGUAGE,
} from '../../../../config/ui';
import {
  adminSettingsGeneralBody,
  adminSettingsSecurityBody,
  adminSettingsServerPolicyBody,
  adminSettingsSmtpBody,
  adminSettingsS3Body,
  adminSettingsFeaturesBody,
  adminBanIpBody,
} from '../dto';

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/settings — Get all settings
// ---------------------------------------------------------------------------
router.get('/', async (_req, res) => {
  const settings = await prisma.settings.findFirst();
  jsonOk(res, settings);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/general — Update general settings
// ---------------------------------------------------------------------------
router.patch(
  '/general',
  parseBody(adminSettingsGeneralBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data,
    });

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.general.updated',
      undefined,
      { fields: Object.keys(data) },
      req.ip,
    );

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/security — Update security settings
// ---------------------------------------------------------------------------
router.patch(
  '/security',
  parseBody(adminSettingsSecurityBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data,
    });

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.security.updated',
      undefined,
      { fields: Object.keys(data) },
      req.ip,
    );

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/server-policy — Update server policy
// ---------------------------------------------------------------------------
router.patch(
  '/server-policy',
  parseBody(adminSettingsServerPolicyBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data,
    });

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.server-policy.updated',
      undefined,
      { fields: Object.keys(data) },
      req.ip,
    );

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/features — Update feature toggles
// ---------------------------------------------------------------------------
router.patch(
  '/features',
  parseBody(adminSettingsFeaturesBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data,
    });

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.features.updated',
      undefined,
      { fields: Object.keys(data) },
      req.ip,
    );

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/features — Update feature toggles
// ---------------------------------------------------------------------------
router.patch(
  '/features',
  parseBody(adminSettingsFeaturesBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data,
    });

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.features.updated',
      undefined,
      { fields: Object.keys(data) },
      req.ip,
    );

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/smtp — Update SMTP settings
// ---------------------------------------------------------------------------
router.patch('/smtp', parseBody(adminSettingsSmtpBody), async (req, res) => {
  const data = req.validatedBody as any;
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
  }

  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data,
  });

  await invalidateSettingsCache();

  logActivity(
    req.adminUser?.id,
    'settings.smtp.updated',
    undefined,
    {},
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/settings/smtp/test — Test SMTP connection
// ---------------------------------------------------------------------------
router.post('/smtp/test', redisRateLimit, async (req, res) => {
  const settings = await prisma.settings.findFirst();
  if (!settings?.smtpHost) {
    return jsonError(res, 'BAD_REQUEST', 'SMTP is not configured', 400);
  }

  try {
    const nodemailerModule = await import('nodemailer');
    const nodemailer = nodemailerModule.default ?? nodemailerModule;
    const transporter = (nodemailer as any).createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort ?? 587,
      secure: settings.smtpSecure,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    await transporter.verify();
    jsonOk(res, { connected: true });
  } catch (err) {
    jsonOk(res, { connected: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/admin/settings/s3 — Update S3 settings
// ---------------------------------------------------------------------------
router.patch('/s3', parseBody(adminSettingsS3Body), async (req, res) => {
  const data = req.validatedBody as any;
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
  }

  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data,
  });

  await invalidateSettingsCache();

  logActivity(req.adminUser?.id, 'settings.s3.updated', undefined, {}, req.ip);

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/settings/s3/test — Test S3 connection
// ---------------------------------------------------------------------------
router.post('/s3/test', async (req, res) => {
  const settings = await prisma.settings.findFirst();
  if (!settings?.s3Enabled || !settings.s3Endpoint) {
    return jsonError(res, 'BAD_REQUEST', 'S3 is not configured', 400);
  }

  try {
    const { S3Client, ListBucketsCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: settings.s3Endpoint,
      region: settings.s3Region ?? 'us-east-1',
      credentials: {
        accessKeyId: settings.s3AccessKey ?? '',
        secretAccessKey: settings.s3SecretKey ?? '',
      },
      forcePathStyle: settings.s3PathStyle,
    });

    await client.send(new ListBucketsCommand({}));
    jsonOk(res, { connected: true });
  } catch (err) {
    jsonOk(res, { connected: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/settings/ban-ip — Ban IP
// ---------------------------------------------------------------------------
router.post('/ban-ip', parseBody(adminBanIpBody), async (req, res) => {
  const { ip, reason } = req.validatedBody as { ip: string; reason?: string };
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
  }

  const bannedIps = Array.isArray(settings.bannedIps)
    ? (settings.bannedIps as string[])
    : [];

  if (bannedIps.includes(ip)) {
    return jsonError(res, 'CONFLICT', 'IP is already banned', 409);
  }

  bannedIps.push(ip);
  await prisma.settings.update({
    where: { id: settings.id },
    data: { bannedIps },
  });

  logActivity(
    req.adminUser?.id,
    'settings.ip.banned',
    undefined,
    { ip, reason },
    req.ip,
  );

  jsonOk(res, { banned: ip });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/settings/unban-ip — Unban IP
// ---------------------------------------------------------------------------
router.post('/unban-ip', parseBody(adminBanIpBody), async (req, res) => {
  const { ip } = req.validatedBody as { ip: string };
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
  }

  const bannedIps = Array.isArray(settings.bannedIps)
    ? (settings.bannedIps as string[])
    : [];

  if (!bannedIps.includes(ip)) {
    return jsonError(res, 'NOT_FOUND', 'IP is not banned', 404);
  }

  const updated = bannedIps.filter((b) => b !== ip);
  await prisma.settings.update({
    where: { id: settings.id },
    data: { bannedIps: updated },
  });

  logActivity(
    req.adminUser?.id,
    'settings.ip.unbanned',
    undefined,
    { ip },
    req.ip,
  );

  jsonOk(res, { unbanned: ip });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/settings/reset — restore the branding/general defaults
// (port of the legacy POST /admin/settings/reset handler).
// The legacy handler copied public/assets/favicon.ico onto itself — a no-op
// with an identical source and destination — so it is not reproduced here.
// ---------------------------------------------------------------------------
const SETTINGS_RESET_DATA = {
  title: 'Airlink',
  logo: DEFAULT_LOGO_PATH,
  favicon: DEFAULT_FAVICON_PATH,
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  allowRegistration: false,
  loginWallpaper: null,
  registerWallpaper: null,
  panelWallpaper: null,
};

router.post('/reset', redisRateLimit, async (req, res) => {
  try {
    const settings = await prisma.settings.findFirst();
    let updated;
    if (settings) {
      updated = await prisma.settings.update({
        where: { id: settings.id },
        data: SETTINGS_RESET_DATA,
      });
    } else {
      updated = await prisma.settings.create({ data: SETTINGS_RESET_DATA });
    }

    await invalidateSettingsCache();

    logActivity(
      req.adminUser?.id,
      'settings.reset',
      undefined,
      {},
      req.ip,
    );

    jsonOk(res, { reset: true, settings: updated });
  } catch (error) {
    logger.error('Failed to reset settings:', error);
    jsonError(res, 'RESET_FAILED', 'Failed to reset settings.', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/settings/example-theme — build the example theme archive.
// The page route does `res.json(await apiGet(...))`, so the zip travels as
// base64 (`{ filename, contentType, data }`) instead of a file download.
// ---------------------------------------------------------------------------
router.get('/example-theme', redisRateLimit, async (_req, res) => {
  try {
    const info = {
      name: 'Example Theme',
      author: 'Your Name',
      updatedAt: new Date().toISOString().split('T')[0],
    };

    const zip = new AdmZip();
    zip.addFile('info.json', Buffer.from(JSON.stringify(info, null, 2)));
    zip.addFile(
      'light.css',
      Buffer.from('/* light mode theme */\n:root {}\n'),
    );
    zip.addFile(
      'dark.css',
      Buffer.from('/* dark mode theme */\n:root {}\n'),
    );

    jsonOk(res, {
      filename: 'example-theme.zip',
      contentType: 'application/zip',
      data: zip.toBuffer().toString('base64'),
    });
  } catch (error) {
    logger.error('Failed to generate example theme:', error);
    jsonError(res, 'THEME_FAILED', 'Failed to generate example theme.', 500);
  }
});

export default router;
