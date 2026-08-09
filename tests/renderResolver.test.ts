import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { Router } from 'express';
import type { AddressInfo } from 'node:net';
import { installRenderResolver } from '../src/handlers/renderResolver';

vi.mock('../src/handlers/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}));

let root: string;
let viewsDir: string;
let addonsDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'render-resolver-'));
  viewsDir = path.join(root, 'views');
  addonsDir = path.join(root, 'addons');
  fs.mkdirSync(viewsDir, { recursive: true });
  fs.mkdirSync(path.join(addonsDir, 'demo-addon', 'views'), { recursive: true });
  fs.mkdirSync(path.join(addonsDir, 'other-addon', 'views'), { recursive: true });
  fs.writeFileSync(path.join(viewsDir, 'primary.ejs'), '<h1>primary</h1>');
  fs.writeFileSync(path.join(addonsDir, 'demo-addon', 'views', 'fallback.ejs'), '<h1>addon</h1>');
  fs.writeFileSync(path.join(addonsDir, 'demo-addon', 'views', 'nested.ejs'), '<h1>nested</h1>');
  fs.writeFileSync(path.join(addonsDir, 'other-addon', 'views', 'other.ejs'), '<h1>other</h1>');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function renderWithResolver(
  view: string,
  opts: Record<string, unknown>,
  getAddonDirs = () => ['other-addon', 'demo-addon'],
): Promise<{ html: string; status: number }> {
  const app = express();
  app.set('views', viewsDir);
  app.set('view engine', 'ejs');
  app.use(installRenderResolver({ viewsPath: viewsDir, addonViewsDir: addonsDir, getAddonDirs }));

  const router = Router();
  router.get('/test', (req, res) => {
    res.render(view, opts);
  });
  app.use(router);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;

  const resp = await fetch(`http://127.0.0.1:${port}/test`);
  const html = await resp.text();

  await new Promise<void>((resolve) => server.close(() => resolve()));

  return { html, status: resp.status };
}

describe('installRenderResolver', () => {
  it('renders a primary view when it exists', async () => {
    const { html, status } = await renderWithResolver('primary', {});
    expect(status).toBe(200);
    expect(html).toContain('<h1>primary</h1>');
  });

  it('falls back to an addon view when the primary view is missing', async () => {
    const { html, status } = await renderWithResolver('fallback', {});
    expect(status).toBe(200);
    expect(html).toContain('<h1>addon</h1>');
  });

  it('renders nested views from the requested addon slug first', async () => {
    const { html, status } = await renderWithResolver('nested', { addonSlug: 'demo-addon' });
    expect(status).toBe(200);
    expect(html).toContain('<h1>nested</h1>');
  });

  it('scans other addons when the requested slug does not own the view', async () => {
    const { html, status } = await renderWithResolver('other', { addonSlug: 'demo-addon' });
    expect(status).toBe(200);
    expect(html).toContain('<h1>other</h1>');
  });

  it('delegates to Express render (no addon fallback) for views found nowhere', async () => {
    // A bare app without an error handler surfaces the delegate render error
    // (500 "Failed to lookup view"); the resolver must NOT invent an addon
    // fallback or return a success. The production app routes this to its own
    // 404/500 handlers exactly as before.
    const { status } = await renderWithResolver('missing-view', {});
    expect(status).toBe(500);
  });

  it('skips the requested addon while scanning other addons', async () => {
    // 'fallback' only exists in demo-addon; requesting slug 'other-addon' should
    // still find it during the scan of the remaining addon dirs.
    const { html, status } = await renderWithResolver('fallback', { addonSlug: 'other-addon' });
    expect(status).toBe(200);
    expect(html).toContain('<h1>addon</h1>');
  });
});
