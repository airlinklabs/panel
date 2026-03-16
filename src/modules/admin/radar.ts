import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { getParamAsString, getParamAsNumber } from "../../utils/typeHelpers";


// In-memory rate limiter respecting VT free tier: 4/min, 500/day
const vtRateLimit = {
  minuteWindow: 0,
  minuteCount: 0,
  dayWindow: 0,
  dayCount: 0,
  allow(): boolean {
    const now = Math.floor(Date.now() / 1000);
    const minute = Math.floor(now / 60);
    if (minute !== this.minuteWindow) { this.minuteWindow = minute; this.minuteCount = 0; }
    if (this.minuteCount >= 4) return false;
    this.minuteCount++;
    return true;
  },
  allowDaily(): boolean {
    const day = Math.floor(Date.now() / 86400000);
    if (day !== this.dayWindow) { this.dayWindow = day; this.dayCount = 0; }
    if (this.dayCount >= 500) return false;
    this.dayCount++;
    return true;
  },
};

function deriveSeverity(matchCount: number): string {
  if (matchCount >= 10) return 'critical';
  if (matchCount >= 3) return 'high';
  if (matchCount >= 1) return 'medium';
  return 'low';
}

const radarModule: Module = {
  info: {
    name: 'Radar Module',
    description: 'This module provides radar scanning functionality for server volumes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Get available radar scripts
    router.get(
      '/admin/radar/scripts',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const radarDir = path.join(__dirname, '../../../storage/radar');

          try {
            await fs.access(radarDir);
          } catch (error: unknown) {
            await fs.mkdir(radarDir, { recursive: true });
          }

          const files = await fs.readdir(radarDir);
          const scripts = await Promise.all(
            files
              .filter(file => file.endsWith('.json'))
              .map(async file => {
                const content = await fs.readFile(path.join(radarDir, file), 'utf-8');
                try {
                  const scriptData = JSON.parse(content);
                  return {
                    id: file.replace('.json', ''),
                    name: scriptData.name || file,
                    description: scriptData.description || '',
                    version: scriptData.version || '1.0.0',
                    filename: file
                  };
                } catch (error: unknown) {
                  logger.error(`Error parsing radar script ${file}:`, error);
                  return {
                    id: file.replace('.json', ''),
                    name: file,
                    description: 'Invalid script format',
                    version: 'unknown',
                    filename: file
                  };
                }
              })
          );

          res.json({ success: true, scripts });
        } catch (error: unknown) {
          logger.error('Error fetching radar scripts:', error);
          res.status(500).json({ success: false, error: 'Failed to fetch radar scripts' });
        }
      }
    );

    // Check if VirusTotal is configured
    router.get(
      '/admin/radar/virustotal-enabled',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.json({ enabled: !!settings?.virusTotalApiKey });
        } catch {
          res.json({ enabled: false });
        }
      }
    );

    // Submit a file hash to VirusTotal and return the verdict
    router.post(
      '/admin/radar/virustotal',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const apiKey = settings?.virusTotalApiKey;

        if (!apiKey) {
          res.status(503).json({ success: false, error: 'VirusTotal API key is not configured. Add it in Admin Settings.' });
          return;
        }

        if (!vtRateLimit.allow()) {
          res.status(429).json({ success: false, error: 'Rate limit: 4 lookups/min on free tier. Wait a moment.' });
          return;
        }

        if (!vtRateLimit.allowDaily()) {
          res.status(429).json({ success: false, error: 'Daily quota reached: 500 lookups/day on free tier.' });
          return;
        }

        const { hash } = req.body;
        if (!hash || !/^[a-fA-F0-9]{32,64}$/.test(hash)) {
          res.status(400).json({ success: false, error: 'A valid MD5, SHA1, or SHA256 hash is required' });
          return;
        }

        try {
          const vtResponse = await axios.get(
            `https://www.virustotal.com/api/v3/files/${hash}`,
            {
              headers: { 'x-apikey': apiKey },
              timeout: 15000,
            }
          );

          const attrs = vtResponse.data?.data?.attributes;
          if (!attrs) {
            res.json({ success: true, found: false });
            return;
          }

          const stats = attrs.last_analysis_stats || {};
          const total = Object.values(stats).reduce((a: number, b: unknown) => a + (b as number), 0);
          const malicious = (stats.malicious || 0) + (stats.suspicious || 0);

          res.json({
            success: true,
            found: true,
            hash,
            malicious,
            total,
            name: attrs.meaningful_name || attrs.name || null,
            type: attrs.type_description || null,
            size: attrs.size || null,
            firstSeen: attrs.first_submission_date
              ? new Date(attrs.first_submission_date * 1000).toISOString().split('T')[0]
              : null,
            vtLink: `https://www.virustotal.com/gui/file/${hash}`,
          });
        } catch (err: any) {
          if (err?.response?.status === 404) {
            res.json({ success: true, found: false });
          } else {
            logger.error('VirusTotal API error:', err?.message);
            res.status(502).json({ success: false, error: 'VirusTotal request failed', message: err?.message });
          }
        }
      }
    );

    // Run radar scan on a server
    router.post(
      '/admin/radar/scan/:serverId',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { serverId } = req.params;
          const { scriptId } = req.body;

          if (!serverId || !scriptId) {
            res.status(400).json({
              success: false,
              error: 'Server ID and Script ID are required'
            });
            return;
          }

          // Get server information
          const server = await prisma.server.findUnique({
            where: { id: getParamAsNumber(serverId) },
            include: { node: true }
          });

          if (!server) {
            res.status(404).json({
              success: false,
              error: 'Server not found'
            });
            return;
          }

          // Get the script content
          const scriptPath = path.join(__dirname, '../../../storage/radar', `${scriptId}.json`);
          const scriptContent = await fs.readFile(scriptPath, 'utf-8');
          const script = JSON.parse(scriptContent);
          
          const response = await axios.post(
            `http://${server.node.address}:${server.node.port}/radar/scan`,
            {
              id: server.UUID,
              script
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`Airlink:${server.node.key}`).toString('base64')}`
              },
              timeout: 60000
            }
          );

          const scanData = response.data;

          // Attach severity from the script pattern definitions to each result
          // so the frontend can colour-code without having to re-derive it
          if (scanData && Array.isArray(scanData.results)) {
            const patternMap: Record<string, string> = {};
            for (const p of script.patterns) {
              const key = (p.description || '').toLowerCase();
              if (p.severity) patternMap[key] = p.severity;
            }

            scanData.results = scanData.results.map((result: any) => {
              const key = (result.pattern?.description || '').toLowerCase();
              return {
                ...result,
                severity: patternMap[key] || deriveSeverity(result.matches?.length ?? 0)
              };
            });
          }

          res.json({
            success: true,
            serverName: server.name,
            scriptName: script.name,
            results: scanData
          });
        } catch (error: unknown) {
          logger.error('Error running radar scan:', error);
          const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown error occurred';

          res.status(500).json({
            success: false,
            error: 'Failed to run radar scan',
            message: errorMessage
          });
        }
      }
    );

    // VirusTotal full file scan — zip scannable server folders, upload to VT, return per-file verdicts
    router.post(
      '/admin/radar/vtscan/:serverId',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const apiKey = settings?.virusTotalApiKey;

        if (!apiKey) {
          res.status(503).json({ success: false, error: 'VirusTotal API key is not configured. Add it in Admin Settings.' });
          return;
        }

        if (!vtRateLimit.allow()) {
          res.status(429).json({ success: false, error: 'Rate limit: 4 requests/min on free tier. Wait a moment.' });
          return;
        }

        if (!vtRateLimit.allowDaily()) {
          res.status(429).json({ success: false, error: 'Daily quota reached: 500 requests/day on free tier.' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { id: getParamAsNumber(req.params.serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ success: false, error: 'Server not found' });
          return;
        }

        const tmpPath = path.join('/tmp', `vtscan-${server.UUID}-${Date.now()}.zip`);

        try {
          // Ask the node to zip the scannable folders and stream back the archive.
          // Folders included: plugins, mods, config, addons, datapacks
          // Folders excluded: world, world_nether, world_the_end, logs, cache, crash-reports
          const zipResponse = await axios.post(
            `http://${server.node.address}:${server.node.port}/radar/zip`,
            {
              id: server.UUID,
              include: ['plugins', 'mods', 'config', 'addons', 'datapacks'],
              exclude: ['world', 'world_nether', 'world_the_end', 'logs', 'cache', 'crash-reports'],
              maxFileSizeMb: 32,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`Airlink:${server.node.key}`).toString('base64')}`,
              },
              responseType: 'arraybuffer',
              timeout: 120000,
            }
          );

          await fs.writeFile(tmpPath, zipResponse.data);

          const stat = await fs.stat(tmpPath);
          // VT free tier rejects files over 32 MB
          if (stat.size > 32 * 1024 * 1024) {
            await fs.unlink(tmpPath);
            res.status(413).json({ success: false, error: 'Zipped server files exceed 32 MB — VT free tier limit. Try excluding more folders.' });
            return;
          }

          // Upload the zip to VT
          const form = new FormData();
          form.append('file', fsSync.createReadStream(tmpPath), {
            filename: `${server.name}-scan.zip`,
            contentType: 'application/zip',
          });

          const uploadResponse = await axios.post(
            'https://www.virustotal.com/api/v3/files',
            form,
            {
              headers: { ...form.getHeaders(), 'x-apikey': apiKey },
              timeout: 90000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              // Accept 409 — VT returns "Conflict" when the file was already uploaded
              // recently. The response body still contains the analysis ID we need.
              validateStatus: (s) => s === 200 || s === 409,
            }
          );

          const analysisId = uploadResponse.data?.data?.id;
          if (!analysisId) {
            res.status(502).json({ success: false, error: 'VT did not return an analysis ID' });
            return;
          }

          // Poll VT up to 8 times, 20s apart (max ~2.7 min wait).
          // VT typically finishes in 30–90s for small zips on free tier.
          let analysisData: any = null;
          for (let attempt = 0; attempt < 8; attempt++) {
            await new Promise(r => setTimeout(r, 20000));

            const pollResponse = await axios.get(
              `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
              { headers: { 'x-apikey': apiKey }, timeout: 15000 }
            );

            const status = pollResponse.data?.data?.attributes?.status;
            if (status === 'completed') {
              analysisData = pollResponse.data;
              break;
            }
          }

          if (!analysisData) {
            // Still pending after max polls — give the user a direct analysis link
            // Note: /gui/analyses/{id} doesn't exist as a GUI page; the file page is
            // /gui/file/{sha256} but we don't have the sha256 yet, so link to the search.
            res.json({ success: true, pending: true, analysisId, vtLink: `https://www.virustotal.com/gui/home/upload` });
            return;
          }

          // The correct GUI URL needs the file's SHA256, not the analysis ID.
          // VT returns it in the analysis response under meta.file_info.sha256.
          const sha256 = analysisData.meta?.file_info?.sha256 as string | undefined;
          const vtLink = sha256
            ? `https://www.virustotal.com/gui/file/${sha256}`
            : `https://www.virustotal.com/gui/home/upload`;

          const results = analysisData.data?.attributes?.results || {};
          const stats = analysisData.data?.attributes?.stats || {};
          const maliciousEngines = Object.entries(results)
            .filter(([, v]: [string, any]) => v.category === 'malicious' || v.category === 'suspicious')
            .map(([engine, v]: [string, any]) => ({ engine, result: v.result }));

          res.json({
            success: true,
            pending: false,
            serverName: server.name,
            maliciousEngines,
            stats,
            totalEngines: Object.keys(results).length,
            vtLink,
          });
        } catch (err: any) {
          logger.error('VT file scan error:', err?.message);
          res.status(502).json({ success: false, error: err?.message || 'VT file scan failed' });
        } finally {
          fs.unlink(tmpPath).catch(() => {});
        }
      }
    );

    return router;
  }
};


export default radarModule;
