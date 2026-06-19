// ── Settings Store ──
// Typed settings management using the panel's addon config API.
// Reads/writes addon configuration with in-memory caching.

import type { AddonConfigStore, AddonLogger } from '../types/panel';
import type { ModrinthSettings } from '../types/modrinth';

const DEFAULTS: ModrinthSettings = {
  showWarningBanner: false,
  warningTitle: 'Notice',
  warningMessage: '',
  disabledProjectTypes: '',
  blockedProjects: '',
};

const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof ModrinthSettings)[];
const CACHE_TTL_MS = 30_000;

export class SettingsStore {
  private config: AddonConfigStore;
  private logger: AddonLogger;
  private cachedSettings: ModrinthSettings | null = null;
  private cachedAt = 0;

  constructor(config: AddonConfigStore, logger: AddonLogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Get all settings. Uses in-memory cache with TTL.
   */
  async getAll(): Promise<ModrinthSettings> {
    if (this.cachedSettings && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedSettings;
    }

    try {
      const raw = await this.config.getMany(SETTINGS_KEYS);
      const settings: ModrinthSettings = { ...DEFAULTS };

      for (const key of SETTINGS_KEYS) {
        const value = raw[key];
        if (value !== null && value !== undefined) {
          if (key === 'showWarningBanner') {
            (settings as any)[key] = value === 'true';
          } else {
            (settings as any)[key] = value;
          }
        }
      }

      this.cachedSettings = settings;
      this.cachedAt = Date.now();
      return settings;
    } catch (error: any) {
      this.logger.error(`Failed to read settings: ${error.message}`);
      return { ...DEFAULTS };
    }
  }

  /**
   * Get a single setting value.
   */
  async get<K extends keyof ModrinthSettings>(key: K): Promise<ModrinthSettings[K]> {
    const settings = await this.getAll();
    return settings[key];
  }

  /**
   * Update settings. Only updates provided keys.
   */
  async update(partial: Partial<ModrinthSettings>): Promise<void> {
    try {
      const entries: Array<{ key: string; value: string }> = [];
      for (const [key, value] of Object.entries(partial)) {
        if (SETTINGS_KEYS.includes(key as keyof ModrinthSettings)) {
          entries.push({ key, value: String(value) });
        }
      }
      await this.config.setMany(entries);
      this.cachedSettings = null; // Invalidate cache
    } catch (error: any) {
      this.logger.error(`Failed to update settings: ${error.message}`);
    }
  }

  /**
   * Check if a project type is disabled.
   */
  async isProjectTypeDisabled(type: string): Promise<boolean> {
    const settings = await this.getAll();
    if (!settings.disabledProjectTypes) return false;
    return settings.disabledProjectTypes.split(',').map(s => s.trim()).includes(type);
  }

  /**
   * Check if a project is blocked.
   */
  async isProjectBlocked(projectId: string): Promise<boolean> {
    const settings = await this.getAll();
    if (!settings.blockedProjects) return false;
    return settings.blockedProjects.split(',').map(s => s.trim()).includes(projectId);
  }

  /**
   * Reset settings to defaults.
   */
  async reset(): Promise<void> {
    await this.config.deleteAll();
    this.cachedSettings = null;
  }
}
