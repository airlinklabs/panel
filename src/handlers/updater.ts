import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import { httpGet } from '../utils/http';
import { ok, err, type Result } from '../utils/result';

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

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  updateInfo?: string;
}

export type UpdateError =
  | 'NO_CONFIG_FILE'
  | 'NO_GIT_REPO'
  | 'GITHUB_API_ERROR'
  | 'GIT_COMMAND_FAILED'
  | 'BUILD_FAILED'
  | 'RESTART_FAILED';

function isGitRepo(): boolean {
  return fs.existsSync(path.join(process.cwd(), '.git'));
}

function spawnSyncSafe(command: string, args: string[] = [], options: { stdio?: 'inherit' | 'pipe' | 'ignore' } = {}): { success: boolean; output?: string; error?: string } {
  try {
    const result = spawnSync(command, args, {
      shell: false,
      timeout: 120_000,
      encoding: 'utf-8',
      stdio: options.stdio ?? 'pipe',
    });
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    if (result.status !== 0) {
      return { success: false, error: result.stderr ?? `Command exited with status ${result.status}` };
    }
    return { success: true, output: result.stdout };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkForUpdates(): Promise<Result<UpdateInfo, UpdateError>> {
  try {
    const configPath = path.join(process.cwd(), 'storage', 'config.json');
    if (!fs.existsSync(configPath)) {
      return err('NO_CONFIG_FILE');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const currentVersion = config.meta?.version;
    if (!currentVersion) {
      return err('NO_CONFIG_FILE');
    }

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      if (!isGitRepo()) {
        return err('NO_GIT_REPO');
      }

      const response = await httpGet<GithubCommit>(
        'https://api.github.com/repos/airlinklabs/panel/commits/main',
      );
      const latestCommit = response.data;

      const gitResult = spawnSyncSafe('git', ['rev-parse', 'HEAD']);
      if (!gitResult.success) {
        return err('GIT_COMMAND_FAILED');
      }
      const currentCommit = gitResult.output!.trim();

      return ok({
        hasUpdate: currentCommit !== latestCommit.sha,
        latestVersion: latestCommit.sha.substring(0, 7),
        currentVersion: currentCommit.substring(0, 7),
        updateInfo: latestCommit.commit.message,
      });
    } else {
      const response = await httpGet<GithubRelease>(
        'https://api.github.com/repos/airlinklabs/panel/releases/latest',
      );
      const latestRelease = response.data;
      const latestVersion = latestRelease.tag_name.replace('v', '');

      return ok({
        hasUpdate: latestVersion !== currentVersion,
        latestVersion,
        currentVersion,
        updateInfo: `Release ${latestVersion}`,
      });
    }
  } catch (error) {
    logger.error('Error checking for updates:', error);
    return err('GITHUB_API_ERROR');
  }
}

export async function performUpdate(): Promise<Result<void, UpdateError>> {
  if (!isGitRepo()) {
    return err('NO_GIT_REPO');
  }

  try {
    const backupDir = path.join(process.cwd(), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      const fetchResult = spawnSyncSafe('git', ['fetch', 'origin', 'main']);
      if (!fetchResult.success) {
        return err('GIT_COMMAND_FAILED');
      }

      const resetResult = spawnSyncSafe('git', ['reset', '--hard', 'origin/main']);
      if (!resetResult.success) {
        return err('GIT_COMMAND_FAILED');
      }
    } else {
      const response = await httpGet<GithubRelease>(
        'https://api.github.com/repos/airlinklabs/panel/releases/latest',
      );
      const latestRelease = response.data;

      const fetchResult = spawnSyncSafe('git', ['fetch']);
      if (!fetchResult.success) {
        return err('GIT_COMMAND_FAILED');
      }

      const checkoutResult = spawnSyncSafe('git', ['checkout', latestRelease.tag_name]);
      if (!checkoutResult.success) {
        return err('GIT_COMMAND_FAILED');
      }
    }

    const installResult = spawnSyncSafe('pnpm', ['install']);
    if (!installResult.success) {
      return err('BUILD_FAILED');
    }

    const buildResult = spawnSyncSafe('pnpm', ['run', 'build']);
    if (!buildResult.success) {
      return err('BUILD_FAILED');
    }

    if (process.env.NODE_ENV === 'production') {
      const restartResult = spawnSyncSafe('pm2', ['restart', 'panel']);
      if (!restartResult.success) {
        return err('RESTART_FAILED');
      }
    }

    return ok(undefined);
  } catch (error) {
    logger.error('Error performing update:', error);
    return err('GIT_COMMAND_FAILED');
  }
}
