import prisma from '../db';
import logger from './logger';

// Egg sources - GitHub repos containing egg JSON files
const EGG_SOURCES = [
  { id: 'game', owner: 'parkervcp', repo: 'eggs', path: 'game_eggs', label: 'Games' },
  { id: 'bot', owner: 'parkervcp', repo: 'eggs', path: 'bots', label: 'Bots' },
  { id: 'database', owner: 'parkervcp', repo: 'eggs', path: 'database', label: 'Databases' },
  { id: 'generic', owner: 'parkervcp', repo: 'eggs', path: 'generic', label: 'Generic' },
  { id: 'software', owner: 'parkervcp', repo: 'eggs', path: 'software', label: 'Software' },
  { id: 'voice', owner: 'parkervcp', repo: 'eggs', path: 'voice_servers', label: 'Voice Servers' },
  { id: 'monitoring', owner: 'parkervcp', repo: 'eggs', path: 'monitoring', label: 'Monitoring' },
  { id: 'storage', owner: 'parkervcp', repo: 'eggs', path: 'storage', label: 'Storage' },
];

export interface StoreImage {
  name: string;
  description: string;
  readme: string;
  fullReadme: string;
  groupReadme: string;
  author: string;
  group: string;
  subGroup: string;
  category: string;
  egg: Record<string, unknown>;
  downloadUrl?: string;
  filePath?: string;
}

let lastBuilt = 0;
let updateTimer: NodeJS.Timeout | null = null;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// -- GitHub API helpers --------------------------------------------------------

async function fetchGitHubTree(owner: string, repo: string, branch = 'master'): Promise<Array<{ path: string; type: string }>> {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Airlink-Panel' },
    });
    if (!res.ok) {
      logger.warn(`Catalog: GitHub API returned ${res.status} for ${owner}/${repo}`);
      return [];
    }
    const data = await res.json() as { tree?: Array<{ path: string; type: string }> };
    return data.tree || [];
  } catch (err) {
    logger.warn(`Catalog: failed to fetch tree from ${owner}/${repo}: ${err}`);
    return [];
  }
}

function categorizeEntry(filePath: string): { category: string; group: string; subGroup: string } {
  for (const source of EGG_SOURCES) {
    if (filePath.startsWith(source.path + '/')) {
      const relParts = filePath.slice(source.path.length + 1).split('/');
      return {
        category: source.id,
        group: relParts[0] || 'other',
        subGroup: relParts.slice(0, -1).join('/') || relParts[0] || 'other',
      };
    }
  }
  return { category: 'generic', group: 'other', subGroup: 'other' };
}

async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Airlink-Panel' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Airlink-Panel' } });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch { return null; }
}

function mdToHtml(md: string): string {
  let h = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, c: string) => '<pre><code>' + c.trim() + '</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*?<\/li>(\n|$))+/g, m => '<ul>' + m + '</ul>');
  h = h.split('\n\n').map(b => {
    b = b.trim(); if (!b) return '';
    if (/^<(h[1-6]|ul|ol|pre|hr)/.test(b)) return b;
    return '<p>' + b.replace(/\n/g, ' ') + '</p>';
  }).join('');
  return h;
}

// -- Sync to SQLite ------------------------------------------------------------

async function syncCatalogueToDb(images: StoreImage[]): Promise<void> {
  // Upsert each egg
  for (const img of images) {
    if (!img.filePath) continue;
    try {
      await prisma.eggCatalog.upsert({
        where: { filePath: img.filePath },
        update: {
          name: img.name,
          description: img.description,
          author: img.author,
          category: img.category,
          group: img.group,
          subGroup: img.subGroup,
          downloadUrl: img.downloadUrl || '',
          eggData: JSON.stringify(img.egg),
          readme: img.readme || null,
          fullReadme: img.fullReadme || null,
        },
        create: {
          name: img.name,
          description: img.description,
          author: img.author,
          category: img.category,
          group: img.group,
          subGroup: img.subGroup,
          downloadUrl: img.downloadUrl || '',
          filePath: img.filePath,
          eggData: JSON.stringify(img.egg),
          readme: img.readme || null,
          fullReadme: img.fullReadme || null,
        },
      });
    } catch (err) {
      logger.warn(`Catalog: failed to upsert ${img.filePath}: ${err}`);
    }
  }

  // Fetch and cache category markdown files
  for (const source of EGG_SOURCES) {
    const mdUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/master/${source.path}/README.md`;
    try {
      const md = await fetchRaw(mdUrl);
      if (!md) continue;
      const html = mdToHtml(md);
      await prisma.categoryMD.upsert({
        where: { category: source.id },
        update: { groupName: source.label, markdown: md, html },
        create: { category: source.id, groupName: source.label, markdown: md, html },
      });
    } catch (err) {
      logger.warn(`Catalog: failed to fetch MD for ${source.id}: ${err}`);
    }
  }
}

// -- Catalogue builder ---------------------------------------------------------

async function buildCatalogue(): Promise<StoreImage[]> {
  const tree = await fetchGitHubTree(EGG_SOURCES[0].owner, EGG_SOURCES[0].repo);
  if (tree.length === 0) return [];

  const eggFiles = tree.filter(item =>
    item.type === 'blob' && item.path.endsWith('.json') && item.path.includes('egg-')
  );

  const seen = new Set<string>();
  const unique = eggFiles.filter(item => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });

  logger.info(`Catalog: found ${unique.length} unique egg files`);

  // Download egg JSON in batches
  const images: StoreImage[] = [];
  const BATCH_SIZE = 15;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(item => {
        const { category, group, subGroup } = categorizeEntry(item.path);
        const url = `https://raw.githubusercontent.com/${EGG_SOURCES[0].owner}/${EGG_SOURCES[0].repo}/master/${item.path}`;
        return fetchJson(url).then(raw => ({ raw, category, group, subGroup, url, path: item.path }));
      })
    );

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value?.raw?.name) continue;
      const { raw, category, group, subGroup, url, path: filePath } = r.value;
      images.push({
        name: String(raw.name),
        description: String(raw.description || '').replace(/\r\n/g, ' ').replace(/\r/g, ' ').slice(0, 300),
        readme: '', fullReadme: '', groupReadme: '',
        author: String(raw.author || ''),
        group, subGroup, category,
        egg: raw,
        downloadUrl: url,
        filePath,
      });
    }

    if (i + BATCH_SIZE < unique.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  return images;
}

// -- Public API ---------------------------------------------------------------

export async function initEggCatalogue(): Promise<void> {
  // Try loading from SQLite first
  try {
    const count = await prisma.eggCatalog.count();
    if (count > 0) {
      lastBuilt = Date.now();
      logger.info(`Catalog: ${count} eggs loaded from SQLite`);
      // Refresh in background
      refreshCatalogue();
      return;
    }
  } catch (err) {
    logger.warn(`Catalog: SQLite read failed: ${err}`);
  }

  await refreshCatalogue();
}

async function refreshCatalogue(): Promise<void> {
  try {
    const images = await buildCatalogue();
    if (images.length > 0) {
      await syncCatalogueToDb(images);
      lastBuilt = Date.now();
      logger.info(`Catalog: synced ${images.length} eggs to SQLite`);
    }
  } catch (err) {
    logger.error(`Catalog: refresh failed: ${err}`);
  }

  // Auto-update every 2 hours
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => refreshCatalogue(), TWO_HOURS_MS);
  if (updateTimer.unref) updateTimer.unref();
}

export function getCatalogue(): { images: StoreImage[]; builtAt: number } {
  if (lastBuilt === 0) return { images: [], builtAt: 0 };
  // Will be served from SQLite in the route handler
  return { images: [], builtAt: lastBuilt };
}

export async function getCatalogueFromDb(): Promise<StoreImage[]> {
  try {
    const rows = await prisma.eggCatalog.findMany({ orderBy: { name: 'asc' } });
    return rows.map(row => ({
      name: row.name,
      description: row.description || '',
      readme: row.readme || '',
      fullReadme: row.fullReadme || '',
      groupReadme: '',
      author: row.author || '',
      group: row.group,
      subGroup: row.subGroup || '',
      category: row.category,
      egg: (() => { try { return JSON.parse(row.eggData); } catch { return {}; } })(),
      downloadUrl: row.downloadUrl,
      filePath: row.filePath,
    }));
  } catch (err) {
    logger.error(`Catalog: failed to read from SQLite: ${err}`);
    return [];
  }
}

export async function getCategoryMd(category: string): Promise<{ markdown: string; html: string } | null> {
  try {
    const row = await prisma.categoryMD.findUnique({ where: { category } });
    if (!row) return null;
    return { markdown: row.markdown, html: row.html };
  } catch { return null; }
}

export async function forceRefresh(): Promise<void> {
  try {
    await prisma.eggCatalog.deleteMany();
    await prisma.categoryMD.deleteMany();
  } catch { /* skip */ }
  await refreshCatalogue();
}

export async function downloadEgg(url: string): Promise<Record<string, unknown> | null> {
  return fetchJson(url);
}
