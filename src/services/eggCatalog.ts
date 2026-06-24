import fs from 'fs';
import path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger';

const execAsync = promisify(exec);

const EGGS_DIR = path.resolve('storage/eggs');

const REPOS = [
  { id: 'game',        dir: 'game-eggs',        url: 'https://github.com/pterodactyl/game-eggs.git' },
  { id: 'application', dir: 'application-eggs', url: 'https://github.com/pterodactyl/application-eggs.git' },
  { id: 'generic',     dir: 'generic-eggs',     url: 'https://github.com/pterodactyl/generic-eggs.git' },
];

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
}

let catalogue: StoreImage[] = [];
let lastBuilt = 0;
let updateTimer: NodeJS.Timeout | null = null;

// -- Git helpers --------------------------------------------------------------

function isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function cloneOrPullRepo(repoUrl: string, targetDir: string): Promise<void> {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };

  if (!fs.existsSync(targetDir) || !isGitRepo(targetDir)) {
    if (fs.existsSync(targetDir)) {
      logger.info(`Store: removing broken directory at ${targetDir} before re-cloning`);
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    logger.info(`Store: cloning ${repoUrl}`);
    await execAsync(`git clone "${repoUrl}" "${targetDir}"`, { env });
    return;
  }

  logger.info(`Store: pulling latest for ${path.basename(targetDir)}`);
  await execAsync(`git -C "${targetDir}" pull`, { env });
}

// -- README parser ------------------------------------------------------------

function extractReadmeSummary(md: string): string {
  const lines = md.split('\n').map(l => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('![') || line.startsWith('[![')) continue;
    if (line.startsWith('|')) continue;
    if (line.startsWith('```') || line.startsWith('~~~')) continue;
    if (line.startsWith('---') || line.startsWith('===')) continue;
    if (line.startsWith('<')) continue;
    if (line.length < 15) continue;
    const clean = line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (clean.length >= 15) return clean;
  }
  return '';
}

// -- Catalogue builder --------------------------------------------------------

function buildCatalogueFromDisk(): StoreImage[] {
  const images: StoreImage[] = [];

  for (const repo of REPOS) {
    const repoDir = path.join(EGGS_DIR, repo.dir);
    if (!fs.existsSync(repoDir)) continue;

    function walk(dir: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      let readmeContent = '';
      const readmeFile = entries.find(
        e => e.isFile() && e.name.toLowerCase() === 'readme.md'
      );
      if (readmeFile) {
        try {
          readmeContent = fs.readFileSync(path.join(dir, readmeFile.name), 'utf8');
        } catch {
          readmeContent = '';
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) walk(path.join(dir, entry.name));
          continue;
        }

        if (!entry.isFile()) continue;
        if (!entry.name.startsWith('egg-') || !entry.name.endsWith('.json')) continue;

        const filePath = path.join(dir, entry.name);
        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
          continue;
        }

        if (!raw.name) continue;

        const relDir   = path.relative(repoDir, dir).replace(/\\/g, '/');
        const parts    = relDir.split('/').filter(Boolean);
        const group    = parts[0] || 'other';
        const subGroup = parts.join('/') || group;

        images.push({
          name:        String(raw.name),
          description: String(raw.description || '').replace(/\r\n/g, ' ').replace(/\r/g, ' ').slice(0, 300),
          readme:      extractReadmeSummary(readmeContent),
          fullReadme:  readmeContent,
          groupReadme: '',
          author:      String(raw.author || ''),
          group,
          subGroup,
          category:    repo.id,
          egg:         raw,
        });
      }
    }

    walk(repoDir);

    const groupReadmeMap = new Map<string, string>();
    try {
      for (const entry of fs.readdirSync(repoDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const groupReadmePath = path.join(repoDir, entry.name, 'README.md');
        if (fs.existsSync(groupReadmePath)) {
          try {
            groupReadmeMap.set(entry.name, fs.readFileSync(groupReadmePath, 'utf8'));
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    for (const img of images) {
      if (img.category === repo.id && !img.groupReadme) {
        img.groupReadme = groupReadmeMap.get(img.group) || '';
      }
    }
  }

  return images;
}

// -- Update cycle -------------------------------------------------------------

async function updateRepos(): Promise<void> {
  if (!isGitAvailable()) {
    logger.warn('Store: git not found -- cannot clone egg repos');
    return;
  }

  if (!fs.existsSync(EGGS_DIR)) {
    fs.mkdirSync(EGGS_DIR, { recursive: true });
  }

  const results = await Promise.allSettled(
    REPOS.map(r => cloneOrPullRepo(r.url, path.join(EGGS_DIR, r.dir)))
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.warn(`Store: ${REPOS[i].dir} failed: ${r.reason?.message || r.reason}`);
    }
  });
}

function rebuildCatalogue(): void {
  catalogue = buildCatalogueFromDisk();
  lastBuilt = Date.now();
  logger.info(`Store: catalogue built -- ${catalogue.length} images`);
}

function scheduleAutoUpdate(): void {
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(async () => {
    logger.info('Store: auto-updating egg repos');
    await updateRepos();
    rebuildCatalogue();
  }, TWO_DAYS_MS);
  if (updateTimer.unref) updateTimer.unref();
}

// -- Public API ---------------------------------------------------------------

export async function initEggCatalogue(): Promise<void> {
  await updateRepos();
  rebuildCatalogue();
  scheduleAutoUpdate();
}

export function getCatalogue(): { images: StoreImage[]; builtAt: number } {
  if (catalogue.length === 0 && lastBuilt === 0) {
    rebuildCatalogue();
  }
  return { images: catalogue, builtAt: lastBuilt };
}

export async function forceRefresh(): Promise<void> {
  await updateRepos();
  rebuildCatalogue();
}
