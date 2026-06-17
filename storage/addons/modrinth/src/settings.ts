import type { AddonApi } from './types';

// ── Settings Store ────────────────────────────────────────────────────
// Uses addonv2 config store. Parses comma-separated list fields.

import { DEFAULT_SETTINGS, type ModrinthSettings } from './types';

export class SettingsStore {
  private cache: ModrinthSettings | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30_000;

  constructor(private api: AddonApi) {}

  async get(): Promise<ModrinthSettings> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.CACHE_TTL) return this.cache;

    const showWarningBanner = (await this.api.config.get('showWarningBanner')) === 'true';
    const warningTitle = (await this.api.config.get('warningTitle')) || DEFAULT_SETTINGS.warningTitle;
    const warningMessage = (await this.api.config.get('warningMessage')) || DEFAULT_SETTINGS.warningMessage;
    const disabledProjectTypes = parseCommaList(await this.api.config.get('disabledProjectTypes'));
    const blockedProjects = parseCommaList(await this.api.config.get('blockedProjects'));

    this.cache = { showWarningBanner, warningTitle, warningMessage, disabledProjectTypes, blockedProjects };
    this.cacheTime = now;
    return this.cache;
  }

  async update(data: Partial<ModrinthSettings>): Promise<void> {
    if (data.showWarningBanner !== undefined) {
      await this.api.config.set('showWarningBanner', String(data.showWarningBanner));
    }
    if (data.warningTitle !== undefined) {
      await this.api.config.set('warningTitle', data.warningTitle);
    }
    if (data.warningMessage !== undefined) {
      await this.api.config.set('warningMessage', data.warningMessage);
    }
    if (data.disabledProjectTypes !== undefined) {
      await this.api.config.set('disabledProjectTypes', data.disabledProjectTypes.join(','));
    }
    if (data.blockedProjects !== undefined) {
      await this.api.config.set('blockedProjects', data.blockedProjects.join(','));
    }
    this.cache = null;
  }

  isProjectBlocked(projectId: string, settings: ModrinthSettings): boolean {
    return settings.blockedProjects.includes(projectId);
  }

  isTypeDisabled(projectType: string, settings: ModrinthSettings): boolean {
    return settings.disabledProjectTypes.includes(projectType);
  }
}

function parseCommaList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}
