import {
  getSettings as getCachedSettings,
  invalidateSettingsCache,
} from '../handlers/settingsCache';
import prisma from '../db';

export interface SettingsUpdate {
  title?: string;
  description?: string;
  logo?: string;
  favicon?: string;
  theme?: string;
  language?: string;
}

/**
 * Get panel settings (cached).
 */
export async function getSettings() {
  return getCachedSettings();
}

/**
 * Update panel settings. Only provided fields are overwritten.
 * Invalidates the settings cache so subsequent reads return fresh data.
 */
export async function updateSettings(data: SettingsUpdate) {
  const current = await getCachedSettings();
  if (!current) {
    return null;
  }
  const updated = await prisma.settings.update({
    where: { id: current.id },
    data: {
      title: data.title !== undefined ? data.title : current.title,
      description:
        data.description !== undefined ? data.description : current.description,
      logo: data.logo !== undefined ? data.logo : current.logo,
      favicon: data.favicon !== undefined ? data.favicon : current.favicon,
      theme: data.theme !== undefined ? data.theme : current.theme,
      language: data.language !== undefined ? data.language : current.language,
      updatedAt: new Date(),
    },
  });
  await invalidateSettingsCache();
  return updated;
}
