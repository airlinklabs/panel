/**
 * V2 API — Account endpoints.
 *
 * GET    /api/v2/account                        — Get current user profile
 * PATCH  /api/v2/account/username               — Update username
 * PATCH  /api/v2/account/email                  — Change email
 * PATCH  /api/v2/account/password               — Change password
 * PATCH  /api/v2/account/description            — Update description
 * PATCH  /api/v2/account/preferred-node         — Set preferred node
 * PATCH  /api/v2/account/language               — Set language
 * POST   /api/v2/account/avatar                 — Upload avatar
 * DELETE /api/v2/account/avatar                 — Remove avatar
 * GET    /api/v2/account/check-username         — Check if username is available
 * POST   /api/v2/account/validate-password      — Validate password strength
 * GET    /api/v2/account/2fa/setup              — Get 2FA setup data
 * POST   /api/v2/account/2fa/enable             — Enable 2FA
 * POST   /api/v2/account/2fa/disable            — Disable 2FA
 * POST   /api/v2/account/images                 — Create user image
 * POST   /api/v2/account/images/import-url      — Import image from URL
 * DELETE /api/v2/account/images/:id             — Delete user image
 * GET    /api/v2/account/folders                — List folders
 * POST   /api/v2/account/folders                — Create folder
 * DELETE /api/v2/account/folders/:id            — Delete folder
 * POST   /api/v2/account/folders/:id/servers    — Add server to folder
 * DELETE /api/v2/account/folders/servers/:uuid  — Remove server from folder
 * POST   /api/v2/account/onboarding/complete    — Complete onboarding
 * POST   /api/v2/account/onboarding/skip        — Skip onboarding
 */

import { Router } from "express";
import prisma from "../../../db";
import bcrypt from "bcryptjs";
import multer from "multer";
import { parseBody } from "../../../utils/validation";
import { jsonOk, jsonError, requireUser, logActivity } from "./helpers";
import {
  updateUsernameBody,
  updateEmailBody,
  updatePasswordBody,
  updateDescriptionBody,
  updatePreferredNodeBody,
  updateLanguageBody,
  validatePasswordBody,
  createImageBody,
  importImageUrlBody,
  createFolderBody,
  addServerToFolderBody,
} from './dto';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/account — Get current user profile
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

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
router.patch("/username", parseBody(updateUsernameBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const { username } = req.validatedBody as { username: string };

  // Check uniqueness
  const existing = await prisma.users.findUnique({ where: { username } });
  if (existing && existing.id !== user.id) {
    return jsonError(res, "CONFLICT", "Username is already taken", 409);
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data: { username },
    select: { id: true, username: true },
  });

  logActivity(
    user.id,
    "account.username.updated",
    undefined,
    { username },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/email — Change email
// ---------------------------------------------------------------------------
router.patch("/email", parseBody(updateEmailBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const { email } = req.validatedBody as { email: string };

  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing && existing.id !== user.id) {
    return jsonError(res, "CONFLICT", "Email is already in use", 409);
  }

  const updated = await prisma.users.update({
    where: { id: user.id },
    data: { email },
    select: { id: true, email: true },
  });

  logActivity(user.id, "account.email.updated", undefined, { email }, req.ip);

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/password — Change password
// ---------------------------------------------------------------------------
router.patch("/password", parseBody(updatePasswordBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const { currentPassword, newPassword } = req.validatedBody as {
    currentPassword: string;
    newPassword: string;
  };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return jsonError(res, "UNAUTHORIZED", "Current password is incorrect", 401);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.users.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  logActivity(user.id, "account.password.updated", undefined, {}, req.ip);

  jsonOk(res, { updated: true });
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/account/description — Update description
// ---------------------------------------------------------------------------
router.patch(
  "/description",
  parseBody(updateDescriptionBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }

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
  "/preferred-node",
  parseBody(updatePreferredNodeBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }

    const { nodeId } = req.validatedBody as { nodeId: number | null };

    if (nodeId !== null) {
      const node = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!node) {
        return jsonError(res, "NOT_FOUND", "Node not found", 404);
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
router.patch("/language", parseBody(updateLanguageBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const { language } = req.validatedBody as { language: string };

  // Store in session or user pref — for now just acknowledge
  jsonOk(res, { language });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/avatar — Upload avatar
// ---------------------------------------------------------------------------
router.post("/avatar", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  // Check if multipart file upload
  if (!req.file) {
    return jsonError(res, "BAD_REQUEST", "No file uploaded", 400);
  }

  const file = req.file;
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "Only JPEG, PNG, GIF, and WebP images are allowed",
      400,
    );
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return jsonError(res, "BAD_REQUEST", "File must be less than 5MB", 400);
  }

  // Generate avatar path
  const ext = file.mimetype.split("/")[1] || "png";
  const avatarName = `avatar-${user.id}-${Date.now()}.${ext}`;
  const fs = await import("fs/promises");
  const path = await import("path");
  const uploadDir = path.default.join(
    process.cwd(),
    "public",
    "uploads",
    "avatars",
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
    "account.avatar.updated",
    undefined,
    { avatar: avatarUrl },
    req.ip,
  );

  jsonOk(res, { avatar: avatarUrl });
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/account/avatar — Remove avatar
// ---------------------------------------------------------------------------
router.delete("/avatar", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  await prisma.users.update({
    where: { id: user.id },
    data: { avatar: null },
  });

  logActivity(user.id, "account.avatar.removed", undefined, {}, req.ip);

  jsonOk(res, { removed: true });
});

// ---------------------------------------------------------------------------
// GET /api/v2/account/2fa/setup — Get 2FA setup data
// ---------------------------------------------------------------------------
router.get("/2fa/setup", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  if (user.totpEnabled) {
    return jsonError(res, 'BAD_REQUEST', '2FA is already enabled', 400);
  }

  if (user.totpEnabled) {
    return jsonError(res, "BAD_REQUEST", "2FA is already enabled", 400);
  }

  const OTPAuth = await import("otpauth");
  const secret = new OTPAuth.Secret({ size: 20 });
  const secretBase32 = secret.base32;

  const totp = new OTPAuth.TOTP({
    issuer: "Airlink",
    label: user.email,
    algorithm: "SHA1",
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
router.post("/2fa/enable", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  if (user.totpEnabled) {
    return jsonError(res, "BAD_REQUEST", "2FA is already enabled", 400);
  }

  const { code } = req.body as { code?: string };
  if (!code) {
    return jsonError(res, "BAD_REQUEST", "Verification code is required", 400);
  }

  if (!user.totpSecret) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "No 2FA setup in progress. Call GET /2fa/setup first",
      400,
    );
  }

  const OTPAuth = await import("otpauth");
  const totp = new OTPAuth.TOTP({
    issuer: "Airlink",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totpSecret),
  });

  const delta = totp.validate({ token: code, window: 2 });
  if (delta === null) {
    return jsonError(res, "BAD_REQUEST", "Invalid verification code", 400);
  }

  // Generate recovery codes
  const crypto = await import("crypto");
  const recoveryCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex"),
  );

  await prisma.users.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      totpRecoveryCodes: JSON.stringify(recoveryCodes),
    },
  });

  logActivity(user.id, "account.2fa.enabled", undefined, {}, req.ip);

  jsonOk(res, { enabled: true, recoveryCodes });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/2fa/disable — Disable 2FA
// ---------------------------------------------------------------------------
router.post("/2fa/disable", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  if (!user.totpEnabled) {
    return jsonError(res, "BAD_REQUEST", "2FA is not enabled", 400);
  }

  const { code, recoveryCode } = req.body as {
    code?: string;
    recoveryCode?: string;
  };

  let verified = false;

  if (code && user.totpSecret) {
    const OTPAuth = await import("otpauth");
    const totp = new OTPAuth.TOTP({
      issuer: "Airlink",
      label: user.email,
      algorithm: "SHA1",
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
    return jsonError(res, "BAD_REQUEST", "Invalid code or recovery code", 400);
  }

  await prisma.users.update({
    where: { id: user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
    },
  });

  logActivity(user.id, "account.2fa.disabled", undefined, {}, req.ip);

  jsonOk(res, { disabled: true });
});

// ---------------------------------------------------------------------------
// GET /api/v2/account/check-username — Check if username is available
// ---------------------------------------------------------------------------
router.get('/check-username', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const username = String(req.query.username ?? '');
  if (username.length < 3 || username.length > 32) {
    return jsonOk(res, { available: false });
  }

  const existing = await prisma.users.findUnique({ where: { username } });
  jsonOk(res, { available: !existing || existing.id === user.id });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/validate-password — Validate password strength
// ---------------------------------------------------------------------------
router.post(
  '/validate-password',
  parseBody(validatePasswordBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }

    const { password } = req.validatedBody as { password: string };
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (password.length > 128) {
      errors.push('Password must be at most 128 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain a lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain a number');
    }

    jsonOk(res, { valid: errors.length === 0, errors });
  },
);

// ---------------------------------------------------------------------------
// POST /api/v2/account/images — Create user image
// ---------------------------------------------------------------------------
router.post('/images', parseBody(createImageBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const data = req.validatedBody as {
    name: string;
    dockerImages?: string;
    startup?: string;
    stop?: string;
    variables?: string;
    info?: string;
    config_files?: string;
  };

  const image = await prisma.images.create({
    data: {
      name: data.name,
      dockerImages: data.dockerImages ?? null,
      startup: data.startup ?? null,
      stop: data.stop ?? null,
      variables: data.variables ?? null,
      info: data.info ?? null,
      config_files: data.config_files ?? null,
      status: 'pending',
      createdById: user.id,
    },
  });

  logActivity(
    user.id,
    'account.images.created',
    undefined,
    { imageId: image.id },
    req.ip,
  );

  jsonOk(res, image);
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/images/import-url — Import image from URL
// ---------------------------------------------------------------------------
router.post(
  '/images/import-url',
  parseBody(importImageUrlBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }

    const { url } = req.validatedBody as { url: string };

    let imageJson: Record<string, unknown>;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return jsonError(
          res,
          'BAD_REQUEST',
          'Failed to fetch image from URL',
          400,
        );
      }
      imageJson = (await response.json()) as Record<string, unknown>;
    } catch {
      return jsonError(res, 'BAD_REQUEST', 'Invalid image URL', 400);
    }

    const image = await prisma.images.create({
      data: {
        name: (imageJson.name as string) ?? 'Imported Image',
        description: (imageJson.description as string) ?? null,
        dockerImages: (imageJson.dockerImages as string) ?? null,
        startup: (imageJson.startup as string) ?? null,
        stop: (imageJson.stop as string) ?? null,
        variables: (imageJson.variables as string) ?? null,
        info: (imageJson.info as string) ?? null,
        config_files: (imageJson.config_files as string) ?? null,
        status: 'pending',
        createdById: user.id,
      },
    });

    logActivity(
      user.id,
      'account.images.imported',
      undefined,
      { imageId: image.id },
      req.ip,
    );

    jsonOk(res, image);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v2/account/images/:id — Delete user image
// ---------------------------------------------------------------------------
router.delete('/images/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid image ID', 400);
  }

  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Image not found', 404);
  }
  if (image.createdById !== user.id) {
    return jsonError(
      res,
      'FORBIDDEN',
      'You can only delete your own images',
      403,
    );
  }

  await prisma.images.delete({ where: { id } });

  logActivity(
    user.id,
    'account.images.deleted',
    undefined,
    { imageId: id },
    req.ip,
  );

  jsonOk(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// GET /api/v2/account/folders — List folders
// ---------------------------------------------------------------------------
router.get('/folders', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const folders = await prisma.serverFolder.findMany({
    where: { ownerId: user.id },
    include: {
      members: {
        include: { server: { select: { UUID: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  jsonOk(res, folders);
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/folders — Create folder
// ---------------------------------------------------------------------------
router.post('/folders', parseBody(createFolderBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const { name } = req.validatedBody as { name: string };

  const folder = await prisma.serverFolder.create({
    data: {
      name,
      ownerId: user.id,
    },
  });

  logActivity(
    user.id,
    'account.folders.created',
    undefined,
    { folderId: folder.id },
    req.ip,
  );

  jsonOk(res, folder);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/account/folders/:id — Delete folder
// ---------------------------------------------------------------------------
router.delete('/folders/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid folder ID', 400);
  }

  const folder = await prisma.serverFolder.findUnique({ where: { id } });
  if (!folder) {
    return jsonError(res, 'NOT_FOUND', 'Folder not found', 404);
  }
  if (folder.ownerId !== user.id) {
    return jsonError(
      res,
      'FORBIDDEN',
      'You can only delete your own folders',
      403,
    );
  }

  await prisma.serverFolder.delete({ where: { id } });

  logActivity(
    user.id,
    'account.folders.deleted',
    undefined,
    { folderId: id },
    req.ip,
  );

  jsonOk(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/folders/:id/servers — Add server to folder
// ---------------------------------------------------------------------------
router.post(
  '/folders/:id/servers',
  parseBody(addServerToFolderBody),
  async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) {
      return;
    }

    const folderId = Number(req.params.id);
    if (!Number.isFinite(folderId)) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid folder ID', 400);
    }

    const folder = await prisma.serverFolder.findUnique({
      where: { id: folderId },
    });
    if (!folder) {
      return jsonError(res, 'NOT_FOUND', 'Folder not found', 404);
    }
    if (folder.ownerId !== user.id) {
      return jsonError(
        res,
        'FORBIDDEN',
        'You can only modify your own folders',
        403,
      );
    }

    const { serverUUID } = req.validatedBody as { serverUUID: string };

    // Verify server exists and user owns it
    const server = await prisma.server.findUnique({
      where: { UUID: serverUUID },
    });
    if (!server) {
      return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
    }
    if (server.ownerId !== user.id) {
      return jsonError(
        res,
        'FORBIDDEN',
        'You can only add your own servers',
        403,
      );
    }

    // Check not already in this folder
    const existing = await prisma.serverFolderMember.findUnique({
      where: { serverUUID },
    });
    if (existing) {
      return jsonError(res, 'CONFLICT', 'Server is already in a folder', 409);
    }

    const member = await prisma.serverFolderMember.create({
      data: {
        folderId,
        serverUUID,
      },
    });

    logActivity(
      user.id,
      'account.folders.serverAdded',
      undefined,
      { folderId, serverUUID },
      req.ip,
    );

    jsonOk(res, member);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v2/account/folders/servers/:uuid — Remove server from folder
// ---------------------------------------------------------------------------
router.delete('/folders/servers/:uuid', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const serverUUID = req.params.uuid;
  if (!serverUUID) {
    return jsonError(res, 'BAD_REQUEST', 'Server UUID is required', 400);
  }

  const member = await prisma.serverFolderMember.findUnique({
    where: { serverUUID },
  });
  if (!member) {
    return jsonError(res, 'NOT_FOUND', 'Server is not in any folder', 404);
  }

  // Verify ownership of the folder
  const folder = await prisma.serverFolder.findUnique({
    where: { id: member.folderId },
  });
  if (!folder || folder.ownerId !== user.id) {
    return jsonError(
      res,
      'FORBIDDEN',
      'You can only modify your own folders',
      403,
    );
  }

  await prisma.serverFolderMember.delete({ where: { serverUUID } });

  logActivity(
    user.id,
    'account.folders.serverRemoved',
    undefined,
    { folderId: folder.id, serverUUID },
    req.ip,
  );

  jsonOk(res, { removed: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/onboarding/complete — Complete onboarding
// ---------------------------------------------------------------------------
router.post('/onboarding/complete', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  await prisma.users.update({
    where: { id: user.id },
    data: {
      onboardingCompleted: true,
      onboardingSkipped: false,
    },
  });

  logActivity(user.id, 'account.onboarding.completed', undefined, {}, req.ip);

  jsonOk(res, { completed: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/account/onboarding/skip — Skip onboarding
// ---------------------------------------------------------------------------
router.post('/onboarding/skip', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  await prisma.users.update({
    where: { id: user.id },
    data: {
      onboardingSkipped: true,
    },
  });

  logActivity(user.id, 'account.onboarding.skipped', undefined, {}, req.ip);

  jsonOk(res, { skipped: true });
});

export default router;
