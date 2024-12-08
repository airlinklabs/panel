import axios from 'axios';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from './logger';

interface GithubRelease {
  tag_name: string;
  published_at: string;
}

interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  updateInfo?: string;
}> {
  try {
    const configPath = path.join(process.cwd(), 'storage', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const currentVersion = config.meta.version;
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // Check latest commit on main branch
      const response = await axios.get(
        'https://api.github.com/repos/airlinklabs/panel/commits/main',
      );
      const latestCommit: GithubCommit = response.data;
      const currentCommit = execSync('git rev-parse HEAD').toString().trim();

      return {
        hasUpdate: currentCommit !== latestCommit.sha,
        latestVersion: latestCommit.sha.substring(0, 7),
        currentVersion: currentCommit.substring(0, 7),
        updateInfo: latestCommit.commit.message,
      };
    } else {
      // Check latest release
      const response = await axios.get(
        'https://api.github.com/repos/airlinklabs/panel/releases/latest',
      );
      const latestRelease: GithubRelease = response.data;
      const latestVersion = latestRelease.tag_name.replace('v', '');

      return {
        hasUpdate: latestVersion !== currentVersion,
        latestVersion,
        currentVersion,
        updateInfo: `Release ${latestVersion}`,
      };
    }
  } catch (error) {
    logger.error('Error checking for updates:', error);
    throw error;
  }
}

export async function performUpdate(): Promise<boolean> {
  try {
    const backupDir = path.join(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // Pull latest commits
      execSync('git fetch origin main', { stdio: 'inherit' });
      execSync('git reset --hard origin/main', { stdio: 'inherit' });
    } else {
      // Checkout latest release
      const response = await axios.get(
        'https://api.github.com/repos/airlinklabs/panel/releases/latest',
      );
      const latestRelease: GithubRelease = response.data;
      execSync(`git fetch && git checkout ${latestRelease.tag_name}`, {
        stdio: 'inherit',
      });
    }

    // Update dependencies and rebuild
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm run build-ts', { stdio: 'inherit' });

    // Restart if using PM2 in production
    if (process.env.NODE_ENV === 'production') {
      execSync('pm2 restart panel');
    }

    return true;
  } catch (error) {
    logger.error('Error performing update:', error);
    return false;
  }
}
