/**
 * V2 API — Admin locations, mounts, apikeys, addons, overview, radar, analytics, playerstats endpoints.
 *
 * Locations:
 *   GET    /api/v2/admin/locations
 *   POST   /api/v2/admin/locations
 *   PUT    /api/v2/admin/locations/:id
 *   DELETE /api/v2/admin/locations/:id
 *
 * Mounts:
 *   GET    /api/v2/admin/mounts
 *   POST   /api/v2/admin/mounts
 *   DELETE /api/v2/admin/mounts/:id
 *
 * API Keys:
 *   GET    /api/v2/admin/apikeys
 *   POST   /api/v2/admin/apikeys
 *   PUT    /api/v2/admin/apikeys/:id
 *   DELETE /api/v2/admin/apikeys/:id
 *   POST   /api/v2/admin/apikeys/:id/toggle
 *
 * Addons:
 *   GET    /api/v2/admin/addons
 *   POST   /api/v2/admin/addons/:slug/toggle
 *   POST   /api/v2/admin/addons/:slug/reload
 *   POST   /api/v2/admin/addons/:slug/uninstall
 *
 * Overview:
 *   GET    /api/v2/admin/overview/check-update
 *   POST   /api/v2/admin/overview/perform-update
 *
 * Radar:
 *   POST   /api/v2/admin/radar/scan/:serverId
 *   GET    /api/v2/admin/radar/virustotal-enabled
 *   GET    /api/v2/admin/radar/scripts
 *   POST   /api/v2/admin/radar/vtscan/:serverId
 *   POST   /api/v2/admin/radar/virustotal
 *
 * Analytics:
 *   GET    /api/v2/admin/analytics/summary
 *
 * Player Stats:
 *   GET    /api/v2/admin/playerstats
 *   POST   /api/v2/admin/playerstats/collect
 */

import { Router } from "express";
import prisma from "../../../../db";
import { parseBody } from "../../../../utils/validation";
import { jsonOk, jsonError, requireAdmin, logActivity } from "../helpers";
import {
  adminCreateLocationBody,
  adminUpdateLocationBody,
  adminCreateMountBody,
  adminCreateApiKeyBody,
  adminUpdateApiKeyBody,
} from "../dto";
import { getSettings } from "../../../../handlers/settingsCache";
import logger from "../../../../handlers/logger";
import fs from "fs/promises";
import path from "path";
import { httpGet } from "../../../../utils/http";

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ======================== LOCATIONS ========================

router.get("/locations", async (_req, res) => {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { createdAt: "desc" },
  });
  jsonOk(res, locations);
});

router.post(
  "/locations",
  parseBody(adminCreateLocationBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const existing = await prisma.location.findUnique({
      where: { shortCode: data.shortCode },
    });
    if (existing) {
      return jsonError(res, "CONFLICT", "Short code already in use", 409);
    }
    const location = await prisma.location.create({ data });
    logActivity(
      req.adminUser?.id,
      "location.created",
      undefined,
      { name: location.name },
      req.ip,
    );
    jsonOk(res, location);
  },
);

router.put(
  "/locations/:id",
  parseBody(adminUpdateLocationBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
    }
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) {
      return jsonError(res, "NOT_FOUND", "Not found", 404);
    }
    const data = req.validatedBody as any;
    if (data.shortCode) {
      const dup = await prisma.location.findUnique({
        where: { shortCode: data.shortCode },
      });
      if (dup && dup.id !== id) {
        return jsonError(res, "CONFLICT", "Short code already in use", 409);
      }
    }
    const updated = await prisma.location.update({ where: { id }, data });
    jsonOk(res, updated);
  },
);

router.delete("/locations/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  const nodeCount = await prisma.node.count({ where: { locationId: id } });
  if (nodeCount > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete location with ${nodeCount} nodes`,
      409,
    );
  }
  await prisma.location.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    "location.deleted",
    undefined,
    { name: location.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

// ======================== MOUNTS ========================

router.get("/mounts", async (_req, res) => {
  const mounts = await prisma.mount.findMany({
    include: { _count: { select: { servers: true } } },
    orderBy: { createdAt: "desc" },
  });
  jsonOk(res, mounts);
});

router.post("/mounts", parseBody(adminCreateMountBody), async (req, res) => {
  const data = req.validatedBody as any;
  const mount = await prisma.mount.create({ data });
  logActivity(
    req.adminUser?.id,
    "mount.created",
    undefined,
    { name: mount.name },
    req.ip,
  );
  jsonOk(res, mount);
});

router.delete("/mounts/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const mount = await prisma.mount.findUnique({ where: { id } });
  if (!mount) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  const serverCount = await prisma.serverMount.count({
    where: { mountId: id },
  });
  if (serverCount > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete mount used by ${serverCount} servers`,
      409,
    );
  }
  await prisma.mount.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    "mount.deleted",
    undefined,
    { name: mount.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

// ======================== API KEYS ========================

router.get("/apikeys", async (_req, res) => {
  const keys = await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  jsonOk(res, keys);
});

router.post("/apikeys", parseBody(adminCreateApiKeyBody), async (req, res) => {
  const data = req.validatedBody as any;
  const crypto = await import("crypto");
  const key = crypto.randomBytes(48).toString("base64url");
  const apiKey = await prisma.apiKey.create({
    data: {
      name: data.name,
      description: data.description,
      key,
      permissions: JSON.stringify(data.permissions ?? []),
    },
    select: {
      id: true,
      name: true,
      key: true,
      description: true,
      permissions: true,
      active: true,
      createdAt: true,
    },
  });
  logActivity(
    req.adminUser?.id,
    "apikey.created",
    undefined,
    { name: data.name },
    req.ip,
  );
  jsonOk(res, apiKey);
});

router.put(
  "/apikeys/:id",
  parseBody(adminUpdateApiKeyBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
    }
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return jsonError(res, "NOT_FOUND", "Not found", 404);
    }
    const data = req.validatedBody as any;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.permissions !== undefined) {
      updateData.permissions = JSON.stringify(data.permissions);
    }
    if (data.active !== undefined) {
      updateData.active = data.active;
    }
    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        permissions: true,
        active: true,
        updatedAt: true,
      },
    });
    jsonOk(res, updated);
  },
);

router.delete("/apikeys/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  await prisma.apiKey.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    "apikey.deleted",
    undefined,
    { name: existing.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

router.post("/apikeys/:id/toggle", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { active: !existing.active },
    select: { id: true, name: true, active: true },
  });
  jsonOk(res, updated);
});

// ======================== ADDONS ========================

router.get("/addons", async (_req, res) => {
  const addons = await prisma.addon.findMany({
    orderBy: { createdAt: "desc" },
  });
  jsonOk(res, addons);
});

router.post("/addons/:slug/toggle", async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {
    return jsonError(res, "NOT_FOUND", "Addon not found", 404);
  }
  const updated = await prisma.addon.update({
    where: { slug: addon.slug },
    data: { enabled: !addon.enabled },
  });
  logActivity(
    req.adminUser?.id,
    "addon.toggled",
    undefined,
    { slug: addon.slug, enabled: updated.enabled },
    req.ip,
  );
  jsonOk(res, updated);
});

router.post("/addons/:slug/reload", async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {
    return jsonError(res, "NOT_FOUND", "Addon not found", 404);
  }
  logActivity(
    req.adminUser?.id,
    "addon.reloaded",
    undefined,
    { slug: addon.slug },
    req.ip,
  );
  jsonOk(res, { reloaded: addon.slug });
});

router.post("/addons/:slug/uninstall", async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {
    return jsonError(res, "NOT_FOUND", "Addon not found", 404);
  }
  await prisma.addon.delete({ where: { slug: addon.slug } });
  await prisma.addonSetting.deleteMany({ where: { addonSlug: addon.slug } });
  logActivity(
    req.adminUser?.id,
    "addon.uninstalled",
    undefined,
    { slug: addon.slug },
    req.ip,
  );
  jsonOk(res, { uninstalled: addon.slug });
});

// ======================== OVERVIEW ========================

router.get("/overview/check-update", async (_req, res) => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/airlinklabs/panel/releases/latest",
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      return jsonOk(res, { updateAvailable: false });
    }
    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
    };
    const currentVersion = process.env.AIRLINK_VERSION ?? "2.0.0";
    const latestVersion = release.tag_name ?? "unknown";
    jsonOk(res, {
      updateAvailable: currentVersion !== latestVersion,
      currentVersion,
      latestVersion,
      releaseName: release.name,
    });
  } catch {
    jsonOk(res, {
      updateAvailable: false,
      error: "Could not check for updates",
    });
  }
});

router.post("/overview/perform-update", async (req, res) => {
  try {
    const { execSync } = await import("child_process");
    execSync("git pull && npm install && npm run build", {
      cwd: process.cwd(),
      timeout: 120000,
    });
    logActivity(req.adminUser?.id, "system.updated", undefined, {}, req.ip);
    jsonOk(res, { updated: true });
  } catch (err) {
    jsonError(res, "UPDATE_FAILED", `Update failed: ${String(err)}`, 500);
  }
});

// ======================== RADAR ========================

router.post("/radar/scan/:serverId", async (req, res) => {
  const serverId = parseInt(String(req.params.serverId), 10);
  if (isNaN(serverId)) {
    return jsonError(res, "BAD_REQUEST", "Invalid server ID", 400);
  }
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return jsonError(res, "NOT_FOUND", "Server not found", 404);
  }
  logActivity(req.adminUser?.id, "radar.scan", server.UUID, {}, req.ip);
  jsonOk(res, { scanRequested: true, serverId });
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/radar/virustotal-enabled — VT status check
// ---------------------------------------------------------------------------
router.get("/radar/virustotal-enabled", async (_req, res) => {
  try {
    const settings = await getSettings();
    jsonOk(res, { enabled: !!settings?.virusTotalApiKey });
  } catch {
    jsonOk(res, { enabled: false });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/radar/scripts — List radar scan scripts
// ---------------------------------------------------------------------------
router.get("/radar/scripts", async (_req, res) => {
  try {
    const radarDir = path.join(__dirname, "../../../../storage/radar");

    try {
      await fs.access(radarDir);
    } catch {
      await fs.mkdir(radarDir, { recursive: true });
    }

    const files = await fs.readdir(radarDir);
    const scripts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await fs.readFile(path.join(radarDir, file), "utf-8");
          try {
            const scriptData = JSON.parse(content);
            return {
              id: file.replace(".json", ""),
              name: scriptData.name || file,
              description: scriptData.description || "",
              version: scriptData.version || "1.0.0",
              filename: file,
            };
          } catch {
            return {
              id: file.replace(".json", ""),
              name: file,
              description: "Invalid script format",
              version: "unknown",
              filename: file,
            };
          }
        }),
    );

    jsonOk(res, scripts);
  } catch (error: unknown) {
    logger.error("Error fetching radar scripts:", error);
    jsonError(res, "SCRIPTS_ERROR", "Failed to fetch radar scripts", 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/radar/vtscan/:serverId — VT file scan
// ---------------------------------------------------------------------------
router.post("/radar/vtscan/:serverId", async (req, res) => {
  const settings = await getSettings();
  const apiKey = settings?.virusTotalApiKey;

  if (!apiKey) {
    return jsonError(
      res,
      "VT_NOT_CONFIGURED",
      "VirusTotal API key is not configured. Add it in Admin Settings.",
      503,
    );
  }

  const serverId = parseInt(String(req.params.serverId), 10);
  if (isNaN(serverId)) {
    return jsonError(res, "BAD_REQUEST", "Invalid server ID", 400);
  }

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });
  if (!server) {
    return jsonError(res, "NOT_FOUND", "Server not found", 404);
  }

  try {
    const { default: fsSync } = await import("fs");
    const { default: pathMod } = await import("path");

    const tmpPath = pathMod.join(
      "/tmp",
      `vtscan-${server.UUID}-${Date.now()}.zip`,
    );

    // Import daemonRequest from the services layer
    const { daemonRequest } =
      await import("../../../../services/daemonService");

    const zipResponse = await daemonRequest(server.UUID, "/radar/zip", {
      method: "POST",
      body: {
        id: server.UUID,
        include: ["plugins", "mods", "config", "addons", "datapacks"],
        exclude: [
          "world",
          "world_nether",
          "world_the_end",
          "logs",
          "cache",
          "crash-reports",
        ],
        maxFileSizeMb: 32,
      },
      timeout: 120000,
    });

    if (!zipResponse.ok) {
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${zipResponse.status}`,
        502,
      );
    }

    const buffer = Buffer.from(await zipResponse.arrayBuffer());
    fsSync.writeFileSync(tmpPath, buffer);

    const stat = fsSync.statSync(tmpPath);
    if (stat.size > 32 * 1024 * 1024) {
      fsSync.unlinkSync(tmpPath);
      return jsonError(
        res,
        "FILE_TOO_LARGE",
        "Zipped server files exceed 32 MB — VT free tier limit.",
        413,
      );
    }

    const fileBuffer = fsSync.readFileSync(tmpPath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const fileName = `${server.name}-scan.zip`;

    const formBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
          "Content-Type: application/zip\r\n\r\n",
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const { httpPost } = await import("../../../../utils/http");

    const uploadResponse = await httpPost<Record<string, unknown>>(
      "https://www.virustotal.com/api/v3/files",
      formBody,
      {
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "x-apikey": apiKey,
        },
        timeout: 90000,
      },
    );

    fsSync.unlinkSync(tmpPath);

    if (uploadResponse.status !== 200 && uploadResponse.status !== 409) {
      return jsonError(
        res,
        "VT_ERROR",
        `VT returned status ${uploadResponse.status}`,
        502,
      );
    }

    const vtUploadData = uploadResponse.data as {
      data?: { id?: string };
    };
    const analysisId = vtUploadData?.data?.id;
    if (!analysisId) {
      return jsonError(
        res,
        "VT_ERROR",
        "VT did not return an analysis ID",
        502,
      );
    }

    // Poll VT up to 8 times, 20s apart
    let analysisData: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 20000));

      const pollResponse = await httpGet<Record<string, unknown>>(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        { headers: { "x-apikey": apiKey }, timeout: 15000 },
      );

      const pollData = pollResponse.data as Record<string, unknown> | undefined;
      const status = (
        (pollData?.data as Record<string, unknown> | undefined)?.attributes as
          Record<string, unknown> | undefined
      )?.status;
      if (status === "completed") {
        analysisData = pollResponse.data;
        break;
      }
    }

    if (!analysisData) {
      return jsonOk(res, {
        pending: true,
        analysisId,
        vtLink: "https://www.virustotal.com/gui/home/upload",
      });
    }

    const meta = analysisData.meta as Record<string, unknown> | undefined;
    const fileInfo = meta?.file_info as Record<string, unknown> | undefined;
    const sha256 = fileInfo?.sha256 as string | undefined;
    const vtLink = sha256
      ? `https://www.virustotal.com/gui/file/${sha256}`
      : "https://www.virustotal.com/gui/home/upload";

    const dataAttrs = (analysisData.data as Record<string, unknown>)
      ?.attributes as Record<string, unknown> | undefined;
    const results = (dataAttrs?.results || {}) as Record<
      string,
      Record<string, unknown>
    >;
    const stats = (dataAttrs?.stats || {}) as Record<string, number>;
    const maliciousEngines = Object.entries(results)
      .filter(
        ([, v]) => v.category === "malicious" || v.category === "suspicious",
      )
      .map(([engine, v]) => ({ engine, result: v.result }));

    jsonOk(res, {
      pending: false,
      serverName: server.name,
      maliciousEngines,
      stats,
      totalEngines: Object.keys(results).length,
      vtLink,
    });
  } catch (error: unknown) {
    logger.error(
      "VT file scan error:",
      error instanceof Error ? error.message : error,
    );
    jsonError(res, "VT_SCAN_FAILED", "File scan failed", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/radar/virustotal — VT hash lookup
// ---------------------------------------------------------------------------
router.post("/radar/virustotal", async (req, res) => {
  const settings = await getSettings();
  const apiKey = settings?.virusTotalApiKey;

  if (!apiKey) {
    return jsonError(
      res,
      "VT_NOT_CONFIGURED",
      "VirusTotal API key is not configured. Add it in Admin Settings.",
      503,
    );
  }

  const { hash } = req.body as { hash?: string };
  if (!hash || !/^[a-fA-F0-9]{32,64}$/.test(hash)) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "A valid MD5, SHA1, or SHA256 hash is required",
      400,
    );
  }

  try {
    const vtResponse = await httpGet<Record<string, unknown>>(
      `https://www.virustotal.com/api/v3/files/${hash}`,
      {
        headers: { "x-apikey": apiKey },
        timeout: 15000,
      },
    );

    if (vtResponse.status === 404) {
      return jsonOk(res, { found: false });
    }

    if (vtResponse.status !== 200) {
      logger.error("VirusTotal API error:", `Status ${vtResponse.status}`);
      return jsonError(
        res,
        "VT_ERROR",
        `VirusTotal request failed — status ${vtResponse.status}`,
        502,
      );
    }

    const vtData = vtResponse.data as Record<string, unknown> | undefined;
    const attrs = (vtData?.data as Record<string, unknown> | undefined)
      ?.attributes as Record<string, unknown> | undefined;
    if (!attrs) {
      return jsonOk(res, { found: false });
    }

    const stats = (attrs.last_analysis_stats || {}) as Record<string, number>;
    const total = Object.values(stats).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const malicious = (stats.malicious || 0) + (stats.suspicious || 0);

    jsonOk(res, {
      found: true,
      hash,
      malicious,
      total,
      name: String(attrs.meaningful_name || attrs.name || null),
      type: String(attrs.type_description || null),
      size: attrs.size || null,
      firstSeen: attrs.first_submission_date
        ? new Date(Number(attrs.first_submission_date) * 1000)
            .toISOString()
            .split("T")[0]
        : null,
      vtLink: `https://www.virustotal.com/gui/file/${hash}`,
    });
  } catch (error: unknown) {
    logger.error(
      "VirusTotal API error:",
      error instanceof Error ? error.message : error,
    );
    jsonError(res, "VT_FAILED", "VirusTotal scan failed", 502);
  }
});

// ======================== ANALYTICS ========================

router.get("/analytics/summary", async (_req, res) => {
  const [totalServers, totalUsers, totalNodes, onlineServers] =
    await Promise.all([
      prisma.server.count(),
      prisma.users.count(),
      prisma.node.count(),
      prisma.server.count({ where: { Running: true } }),
    ]);
  jsonOk(res, { totalServers, totalUsers, totalNodes, onlineServers });
});

// ======================== PLAYER STATS ========================

router.get("/playerstats", async (_req, res) => {
  const stats = await prisma.playerStats.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
  });
  jsonOk(res, stats);
});

router.post("/playerstats/collect", async (req, res) => {
  logActivity(req.adminUser?.id, "playerstats.collect", undefined, {}, req.ip);
  jsonOk(res, { collectRequested: true });
});

export default router;
