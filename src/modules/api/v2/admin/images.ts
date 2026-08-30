/**
 * V2 API — Admin images endpoints.
 *
 * GET    /api/v2/admin/images              — List images (paginated)
 * GET    /api/v2/admin/images/list         — Lightweight list for dropdowns
 * POST   /api/v2/admin/images              — Create image
 * POST   /api/v2/admin/images/upload       — Upload egg JSON from file
 * POST   /api/v2/admin/images/import-url   — Import egg from URL
 * GET    /api/v2/admin/images/store/catalogue — Image store catalogue
 * POST   /api/v2/admin/images/store/refresh  — Refresh catalogue
 * POST   /api/v2/admin/images/store/install  — Install from store
 * GET    /api/v2/admin/images/:id          — Get image
 * PUT    /api/v2/admin/images/:id          — Update image
 * POST   /api/v2/admin/images/:id/approve  — Approve pending image
 * POST   /api/v2/admin/images/:id/reject   — Reject pending image
 * DELETE /api/v2/admin/images/:id          — Delete image
 */

import { Router } from 'express';
import multer from 'multer';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import {
  jsonOk,
  jsonError,
  requireAdmin,
  logActivity,
  parsePage,
  parsePerPage,
} from '../helpers';
import { adminCreateImageBody, adminUpdateImageBody } from '../dto';
import {
  isPterodactylEgg,
  parseEgg,
  normalizeEggForDb,
  validateEggData,
  fetchEggFromUrl,
} from '../../../../handlers/utils/egg/eggParser';
import { invalidateImageCache } from '../../../../handlers/imagesCache';
import {
  getCatalogue,
  forceRefresh,
} from '../../../../handlers/eggCatalogueService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeImageData(raw: Record<string, unknown>) {
  if (isPterodactylEgg(raw)) {
    const egg = parseEgg(raw);
    const data = normalizeEggForDb(egg);
    return {
      ...data,
      portRequirements: JSON.stringify(
        raw.portRequirements ?? raw.port_requirements ?? [],
      ),
    };
  }

  const dockerImages = raw.docker_images || raw.dockerImages;
  const dockerImagesArray = Array.isArray(dockerImages)
    ? dockerImages
    : typeof dockerImages === 'object' && dockerImages !== null
      ? Object.entries(dockerImages as Record<string, string>).map(
        ([k, v]) => ({ [k]: v }),
      )
      : [];

  return {
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    author: String(raw.author ?? ''),
    authorName: String(raw.authorName ?? ''),
    startup: String(raw.startup ?? ''),
    stop: String(raw.stop ?? ''),
    startup_done: String(raw.startup_done ?? ''),
    config_files: String(raw.config_files ?? ''),
    meta: JSON.stringify(raw.meta ?? {}),
    dockerImages: JSON.stringify(dockerImagesArray),
    info: JSON.stringify(raw.info ?? {}),
    scripts: JSON.stringify(raw.scripts ?? {}),
    variables: JSON.stringify(raw.variables ?? []),
    portRequirements: JSON.stringify(
      raw.portRequirements ?? raw.port_requirements ?? [],
    ),
  };
}

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
// GET /api/v2/admin/images — List images (paginated)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const [images, total] = await Promise.all([
    prisma.images.findMany({
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.images.count(),
  ]);
  jsonOk(res, images, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: Math.ceil(total / perPage),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/images/list — Lightweight list for dropdowns
// ---------------------------------------------------------------------------
router.get('/list', async (_req, res) => {
  const images = await prisma.images.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  jsonOk(res, images);
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/images/store/catalogue — Image store catalogue
// ---------------------------------------------------------------------------
router.get('/store/catalogue', async (_req, res) => {
  try {
    const data = getCatalogue();
    jsonOk(res, data);
  } catch {
    jsonError(res, 'STORE_ERROR', 'Failed to load store catalogue', 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images — Create image
// ---------------------------------------------------------------------------
router.post('/', parseBody(adminCreateImageBody), async (req, res) => {
  const data = req.validatedBody as any;
  const image = await prisma.images.create({ data });
  logActivity(
    req.adminUser?.id,
    'image.created',
    undefined,
    { name: image.name },
    req.ip,
  );
  jsonOk(res, image);
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/upload — Upload egg JSON from file
// ---------------------------------------------------------------------------
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    let raw: Record<string, unknown>;

    if (req.file) {
      try {
        raw = JSON.parse(req.file.buffer.toString('utf-8'));
      } catch {
        return jsonError(res, 'BAD_REQUEST', 'File is not valid JSON', 400);
      }
    } else if (
      req.body &&
      typeof req.body === 'object' &&
      Object.keys(req.body).length > 0
    ) {
      raw = req.body as Record<string, unknown>;
    } else {
      return jsonError(res, 'BAD_REQUEST', 'No image data provided', 400);
    }

    const { valid, errors } = validateEggData(raw);
    if (!valid) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Invalid egg configuration',
        400,
        errors.map((e) => ({ field: 'egg', message: e })),
      );
    }

    const data = normalizeImageData(raw);
    const existing = await prisma.images.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      const updated = await prisma.images.update({
        where: { id: existing.id },
        data,
      });
      await invalidateImageCache();
      logActivity(
        req.adminUser?.id,
        'image.updated',
        undefined,
        { imageId: existing.id, name: data.name },
        req.ip,
      );
      jsonOk(res, updated);
    } else {
      const created = await prisma.images.create({ data });
      await invalidateImageCache();
      logActivity(
        req.adminUser?.id,
        'image.created',
        undefined,
        { imageId: created.id, name: data.name },
        req.ip,
      );
      jsonOk(res, created);
    }
  } catch {
    jsonError(res, 'UPLOAD_FAILED', 'Failed to process the uploaded file', 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/import-url — Import egg from URL
// ---------------------------------------------------------------------------
router.post('/import-url', async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim();
    if (!url) {
      return jsonError(res, 'BAD_REQUEST', 'URL is required', 400);
    }

    const result = await fetchEggFromUrl(url);
    if (!result.ok) {
      return jsonError(res, 'BAD_REQUEST', result.error, 400);
    }

    const { valid, errors } = validateEggData(result.payload);
    if (!valid) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Invalid egg configuration',
        400,
        errors.map((e) => ({ field: 'egg', message: e })),
      );
    }

    const data = normalizeImageData(result.payload);
    const existing = await prisma.images.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      const updated = await prisma.images.update({
        where: { id: existing.id },
        data,
      });
      await invalidateImageCache();
      logActivity(
        req.adminUser?.id,
        'image.updated',
        undefined,
        { imageId: existing.id, name: data.name },
        req.ip,
      );
      jsonOk(res, updated);
    } else {
      const created = await prisma.images.create({ data });
      await invalidateImageCache();
      logActivity(
        req.adminUser?.id,
        'image.created',
        undefined,
        { imageId: created.id, name: data.name },
        req.ip,
      );
      jsonOk(res, created);
    }
  } catch {
    jsonError(res, 'IMPORT_FAILED', 'Failed to import egg from URL', 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/store/refresh — Refresh catalogue
// ---------------------------------------------------------------------------
router.post('/store/refresh', async (_req, res) => {
  try {
    forceRefresh().catch(() => {
      /* noop */
    });
    jsonOk(res, {
      message: 'Refresh started. The catalogue will update in the background.',
    });
  } catch {
    jsonError(res, 'REFRESH_FAILED', 'Failed to start refresh', 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/store/install — Install from store
// ---------------------------------------------------------------------------
router.post('/store/install', async (req, res) => {
  try {
    const raw = req.body as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') {
      return jsonError(res, 'BAD_REQUEST', 'Invalid egg data', 400);
    }

    const { valid, errors } = validateEggData(raw);
    if (!valid) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Egg validation failed',
        400,
        errors.map((e) => ({ field: 'egg', message: e })),
      );
    }

    const normalized = normalizeImageData(raw);
    const existing = await prisma.images.findFirst({
      where: { name: normalized.name },
    });
    if (existing) {
      return jsonError(
        res,
        'CONFLICT',
        `An image named "${normalized.name}" already exists.`,
        409,
      );
    }

    const image = await prisma.images.create({ data: normalized });
    await invalidateImageCache();
    logActivity(
      req.adminUser?.id,
      'image.created',
      undefined,
      { imageId: image.id, name: image.name },
      req.ip,
    );
    jsonOk(res, { id: image.id, name: image.name });
  } catch {
    jsonError(res, 'INSTALL_FAILED', 'Failed to install image', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/images/:id — Get image
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  jsonOk(res, image);
});

// ---------------------------------------------------------------------------
// PUT /api/v2/admin/images/:id — Update image
// ---------------------------------------------------------------------------
router.put('/:id', parseBody(adminUpdateImageBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const existing = await prisma.images.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  const data = req.validatedBody as any;
  const updated = await prisma.images.update({ where: { id }, data });
  logActivity(
    req.adminUser?.id,
    'image.updated',
    undefined,
    { id, fields: Object.keys(data) },
    req.ip,
  );
  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/:id/approve — Approve pending image
// ---------------------------------------------------------------------------
router.post('/:id/approve', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Image not found', 404);
  }

  await prisma.images.update({
    where: { id },
    data: { status: 'approved', rejectionReason: null },
  });

  logActivity(
    req.adminUser?.id,
    'image.approved',
    undefined,
    { imageId: id, name: image.name },
    req.ip,
  );
  jsonOk(res, { approved: true, imageId: id });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/images/:id/reject — Reject pending image
// ---------------------------------------------------------------------------
router.post('/:id/reject', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Image not found', 404);
  }

  const reason = String(req.body?.reason ?? '')
    .trim()
    .slice(0, 500);

  await prisma.images.update({
    where: { id },
    data: { status: 'rejected', rejectionReason: reason || null },
  });

  logActivity(
    req.adminUser?.id,
    'image.rejected',
    undefined,
    { imageId: id, name: image.name, reason },
    req.ip,
  );
  jsonOk(res, { rejected: true, imageId: id });
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/images/:id — Delete image
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  const serverCount = await prisma.server.count({ where: { imageId: id } });
  if (serverCount > 0) {
    return jsonError(
      res,
      'CONFLICT',
      `Cannot delete image with ${serverCount} servers`,
      409,
    );
  }
  await prisma.images.delete({ where: { id } });
  await invalidateImageCache();
  logActivity(
    req.adminUser?.id,
    'image.deleted',
    undefined,
    { name: image.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

export default router;
