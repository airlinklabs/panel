import * as fs from 'fs/promises';
import path from 'path';
import { ModrinthSettings, DEFAULT_MODRINTH_SETTINGS } from '../types/modrinth-api';

export class SettingsStore {
  private cache: ModrinthSettings | null = null;
  private cacheExpiry = 0;
  private settingsPath: string;
  private logger: any;

  constructor(addonPath: string, logger: any) {
    this.settingsPath = path.join(addonPath, 'modrinth-settings.json');
    this.logger = logger;
  }

  async get(): Promise<ModrinthSettings> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) return this.cache;

    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = this.parseSettings(parsed);
      this.cacheExpiry = now + 30000;
      return this.cache;
    } catch {
      const defaults = { ...DEFAULT_MODRINTH_SETTINGS };
      try {
        await this.save(defaults);
        this.cache = defaults;
        this.cacheExpiry = now + 30000;
      } catch {
        // Non-critical
      }
      return defaults;
    }
  }

  async save(settings: ModrinthSettings): Promise<void> {
    const clean: ModrinthSettings = {
      modrinthInstallationWarning: Boolean(settings.modrinthInstallationWarning),
      warningTitle: settings.warningTitle?.trim() || DEFAULT_MODRINTH_SETTINGS.warningTitle,
      warningMessage: settings.warningMessage?.trim() || DEFAULT_MODRINTH_SETTINGS.warningMessage,
      disabledProjectTypes: Array.from(new Set<string>(
        (settings.disabledProjectTypes || [])
          .filter((t) => typeof t === 'string' && t.trim())
          .map((t) => t.trim()),
      )),
      blockedProjects: Array.from(new Set<string>(
        (settings.blockedProjects || [])
          .filter((p) => typeof p === 'string' && p.trim())
          .map((p) => p.trim()),
      )),
    };

    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(clean, null, 2), 'utf8');
    this.clearCache();
  }

  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  async isProjectBlocked(projectId: string, projectType: string): Promise<{ blocked: boolean; reason: 'type_disabled' | 'project_blocked' | null }> {
    try {
      const settings = await this.get();
      if (settings.disabledProjectTypes.includes(projectType)) return { blocked: true, reason: 'type_disabled' };
      if (settings.blockedProjects.includes(projectId)) return { blocked: true, reason: 'project_blocked' };
      return { blocked: false, reason: null };
    } catch {
      return { blocked: false, reason: null };
    }
  }

  async filterProjects(projects: any[]): Promise<any[]> {
    if (!Array.isArray(projects) || projects.length === 0) return projects;
    try {
      const settings = await this.get();
      return projects.filter((p) => {
        if (settings.disabledProjectTypes.includes(p.project_type)) return false;
        const id = p.project_id || p.id;
        if (id && settings.blockedProjects.includes(id)) return false;
        return true;
      });
    } catch {
      return projects;
    }
  }

  private parseSettings(raw: any): ModrinthSettings {
    return {
      modrinthInstallationWarning: Boolean(raw.modrinthInstallationWarning),
      warningTitle: typeof raw.warningTitle === 'string' && raw.warningTitle.trim()
        ? raw.warningTitle
        : DEFAULT_MODRINTH_SETTINGS.warningTitle,
      warningMessage: typeof raw.warningMessage === 'string' && raw.warningMessage.trim()
        ? raw.warningMessage
        : DEFAULT_MODRINTH_SETTINGS.warningMessage,
      disabledProjectTypes: Array.isArray(raw.disabledProjectTypes)
        ? raw.disabledProjectTypes.filter((t: any) => typeof t === 'string' && t.trim())
        : [],
      blockedProjects: Array.isArray(raw.blockedProjects)
        ? raw.blockedProjects.filter((p: any) => typeof p === 'string' && p.trim())
        : [],
    };
  }
}
