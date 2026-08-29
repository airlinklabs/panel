/**
 * V2 API — Account endpoints.
 *
 * GET    /api/v2/account                  — Get current user profile
 * PATCH  /api/v2/account/username         — Update username
 * PATCH  /api/v2/account/email            — Change email
 * PATCH  /api/v2/account/password         — Change password
 * PATCH  /api/v2/account/description      — Update description
 * PATCH  /api/v2/account/preferred-node   — Set preferred node
 * PATCH  /api/v2/account/language          — Set language
 * POST   /api/v2/account/avatar            — Upload avatar
 * DELETE /api/v2/account/avatar            — Remove avatar
 * GET    /api/v2/account/2fa/setup         — Get 2FA setup data
 * POST   /api/v2/account/2fa/enable        — Enable 2FA
 * POST   /api/v2/account/2fa/disable       — Disable 2FA
 */

import { Router } from 'express';
import prisma from '../../../db';
import bcrypt from 'bcryptjs';
import { parseBody } from '../../../utils/validation';
import { jsonOk, jsonError, requireUser, logActivity } from './helpers';
import {
  updateUsernameBody,
  updateEmailBody,
  updatePasswordBody,
  updateDescriptionBody,
  updatePreferredNodeBody,
  updateLanguageBody,
} from './dto';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/account — Get current user profile
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const serverCount = await prisma.server.count({
    where: { ownerId: user.id },
  });

  jsonOk(res, {
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
    role: user.role,
    description: user.description,
    avatar: user.avatar,
    serverLimit: user.serverLimit,
    maxMemory: user.maxMemory,
    maxCpu: user.maxCpu,
    maxStorage: user.maxStorage,
    maxDatabases: user.maxDatabases,
    preferredNodeId: user.preferredNodeId,
    totpEnabled: user.totpEnabled,
    createdAt: user.createdAt,
    serverCount,
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/username — Update username
// ---------------------------------------------------------------------------
router.patch('/username', parseBody(updateUsernameBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const { username } = req.validatedBody as { username: string };

  // Check uniqueness
  const existing = await prisma.users.findUnique({ where: { username } });
  if (existing && existing.id !== user.id) {
    return jsonError(res, 'CONFLICT', 'Username is already taken', 409);
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data: { username },
    select: { id: true, username: true },
  });

  logActivity(
    user.id,
    'account.username.updated',
    undefined,
    { username },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/email — Change email
// ---------------------------------------------------------------------------
router.patch('/email', parseBody(updateEmailBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const { email } = req.validatedBody as { email: string };

  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing && existing.id !== user.id) {
    return jsonError(res, 'CONFLICT', 'Email is already in use', 409);
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data: { email },
    select: { id: true, email: true },
  });

  logActivity(user.id, 'account.email.updated', undefined, { email }, req.ip);

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/password — Change password
// ---------------------------------------------------------------------------
router.patch('/password', parseBody(updatePasswordBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const { currentPassword, newPassword } = req.validatedBody as {
    currentPassword: string;
    newPassword: string;
  };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return jsonError(res, 'UNAUTHORIZED', 'Current password is incorrect', 401);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.users.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  logActivity(user.id, 'account.password.updated', undefined, {}, req.ip);

  jsonOk(res, { updated: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/description — Update description
// ---------------------------------------------------------------------------
router.patch(
  '/description',
  parseBody(updateDescriptionBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {return;}

    const { description } = req.validatedBody as { description: string | null };

    const updated = await prisma.users.update({
      where: { id: user.id },
      data: { description },
      select: { id: true, description: true },
    });

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/preferred-node — Set preferred node
// ---------------------------------------------------------------------------
router.patch(
  '/preferred-node',
  parseBody(updatePreferredNodeBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {return;}

    const { nodeId } = req.validatedBody as { nodeId: number | null };

    if (nodeId !== null) {
      const node = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!node) {
        return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
      }
    }

    const updated = await prisma.users.update({
      where: { id: user.id },
      data: { preferredNodeId: nodeId },
      select: { id: true, preferredNodeId: true },
    });

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/language — Set language
// ---------------------------------------------------------------------------
router.patch('/language', parseBody(updateLanguageBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const { language } = req.validatedBody as { language: string };

  // Store in session or user pref — for now just acknowledge
  jsonOk(res, { language });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/avatar — Upload avatar
// ---------------------------------------------------------------------------
router.post('/avatar', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  // Check if multipart file upload
  if (!req.file) {
    return jsonError(res, 'BAD_REQUEST', 'No file uploaded', 400);
  }

  const file = req.file;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'Only JPEG, PNG, GIF, and WebP images are allowed',
      400,
    );
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return jsonError(res, 'BAD_REQUEST', 'File must be less than 5MB', 400);
  }

  // Generate avatar path
  const ext = file.mimetype.split('/')[1] || 'png';
  const avatarName = `avatar-${user.id}-${Date.now()}.${ext}`;
  const fs = await import('fs/promises');
  const path = await import('path');
  const uploadDir = path.default.join(
    process.cwd(),
    'public',
    'uploads',
    'avatars',
  );
  await fs.default.mkdir(uploadDir, { recursive: true });
  await fs.default.writeFile(
    path.default.join(uploadDir, avatarName),
    file.buffer,
  );

  const avatarUrl = `/uploads/avatars/${avatarName}`;

  await prisma.users.update({
    where: { id: user.id },
    data: { avatar: avatarUrl },
  });

  logActivity(
    user.id,
    'account.avatar.updated',
    undefined,
    { avatar: avatarUrl },
    req.ip,
  );

  jsonOk(res, { avatar: avatarUrl });
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/account/avatar — Remove avatar
// ---------------------------------------------------------------------------
router.delete('/avatar', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  await prisma.users.update({
    where: { id: user.id },
    data: { avatar: null },
  });

  logActivity(user.id, 'account.avatar.removed', undefined, {}, req.ip);

  jsonOk(res, { removed: true });
});

// ---------------------------------------------------------------------------
// GET /api/v2/account/2fa/setup — Get 2FA setup data
// ---------------------------------------------------------------------------
router.get('/2fa/setup', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  if (user.totpEnabled) {
    return jsonError(res, 'BAD_REQUEST', '2FA is already enabled', 400);
  }

  const OTPAuth = await import('otpauth');
  const secret = new OTPAuth.Secret({ size: 20 });
  const secretBase32 = secret.base32;

  const totp = new OTPAuth.TOTP({
    issuer: 'Airlink',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUrl = totp.toString();

  // Store temporarily — will be confirmed on enable
  await prisma.users.update({
    where: { id: user.id },
    data: { totpSecret: secretBase32 },
  });

  jsonOk(res, {
    secret: secretBase32,
    otpauthUrl,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/2fa/enable — Enable 2FA
// ---------------------------------------------------------------------------
router.post('/2fa/enable', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  if (user.totpEnabled) {
    return jsonError(res, 'BAD_REQUEST', '2FA is already enabled', 400);
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    return jsonError(res, 'BAD_REQUEST', 'Verification code is required', 400);
  }

  if (!user.totpSecret) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'No 2FA setup in progress. Call GET /2fa/setup first',
      400,
    );
  }

  const OTPAuth = await import('otpauth');
  const totp = new OTPAuth.TOTP({
    issuer: 'Airlink',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totpSecret),
  });

  const delta = totp.validate({ token: code, window: 2 });
  if (delta === null) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid verification code', 400);
  }

  // Generate recovery codes
  const crypto = await import('crypto');
  const recoveryCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString('hex'),
  );

  await prisma.users.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      totpRecoveryCodes: JSON.stringify(recoveryCodes),
    },
  });

  logActivity(user.id, 'account.2fa.enabled', undefined, {}, req.ip);

  jsonOk(res, { enabled: true, recoveryCodes });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/2fa/disable — Disable 2FA
// ---------------------------------------------------------------------------
router.post('/2fa/disable', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  if (!user.totpEnabled) {
    return jsonError(res, 'BAD_REQUEST', '2FA is not enabled', 400);
  }

  const { code, recoveryCode } = req.body as {
    code?: string;
    recoveryCode?: string;
  };

  let verified = false;

  if (code && user.totpSecret) {
    const OTPAuth = await import('otpauth');
    const totp = new OTPAuth.TOTP({
      issuer: 'Airlink',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totpSecret),
    });
    const delta = totp.validate({ token: code, window: 2 });
    verified = delta !== null;
  } else if (recoveryCode && user.totpRecoveryCodes) {
    const codes = JSON.parse(user.totpRecoveryCodes) as string[];
    const idx = codes.indexOf(recoveryCode);
    if (idx !== -1) {
      verified = true;
      codes.splice(idx, 1);
      await prisma.users.update({
        where: { id: user.id },
        data: { totpRecoveryCodes: JSON.stringify(codes) },
      });
    }
  }

  if (!verified) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid code or recovery code', 400);
  }

  await prisma.users.update({
    where: { id: user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
    },
  });

  logActivity(user.id, 'account.2fa.disabled', undefined, {}, req.ip);

  jsonOk(res, { disabled: true });
});

export default router;
