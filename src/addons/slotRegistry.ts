import logger from './logger';

export const SLOT_IDS = [
  'dashboard.home.beforeContent',
  'dashboard.home.afterContent',
  'dashboard.home.sidebar',
  'server.console.beforeContent',
  'server.console.afterContent',
  'server.console.commandRow',
  'server.files.beforeContent',
  'server.files.afterContent',
  'server.backups.beforeContent',
  'server.backups.afterContent',
  'server.settings.beforeContent',
  'server.settings.afterContent',
  'server.startup.beforeContent',
  'server.startup.afterContent',
  'server.players.beforeContent',
  'server.players.afterContent',
  'server.worlds.beforeContent',
  'server.worlds.afterContent',
  'admin.addons.beforeContent',
  'admin.addons.afterContent',
  'admin.overview.beforeContent',
  'admin.overview.afterContent',
  'admin.servers.beforeContent',
  'admin.servers.afterContent',
  'admin.settings.beforeContent',
  'admin.settings.afterContent',
  'admin.users.beforeContent',
  'admin.users.afterContent',
  'auth.login.beforeContent',
  'auth.login.afterContent',
  'auth.register.beforeContent',
  'auth.register.afterContent',
  'layout.dashboard.wrapper',
  'layout.admin.wrapper',
] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotContribution {
  addonSlug: string;
  render: (locals: Record<string, unknown>) => string | Promise<string>;
}

class SlotRegistry {
  private slots = new Map<SlotId, SlotContribution[]>();
  private addonSlotRegistry = new Map<string, SlotId[]>();

  register(slotId: SlotId, addonSlug: string, render: SlotContribution['render']): void {
    if (!SLOT_IDS.includes(slotId)) {
      logger.warn(`Unknown slot "${slotId}" from addon "${addonSlug}"`);
      return;
    }

    const existing = this.slots.get(slotId) ?? [];
    const idx = existing.findIndex(c => c.addonSlug === addonSlug);
    const contribution: SlotContribution = { addonSlug, render };

    if (idx !== -1) {
      existing[idx] = contribution;
    } else {
      existing.push(contribution);
    }
    this.slots.set(slotId, existing);

    const addonSlots = this.addonSlotRegistry.get(addonSlug) ?? [];
    if (!addonSlots.includes(slotId)) {
      addonSlots.push(slotId);
      this.addonSlotRegistry.set(addonSlug, addonSlots);
    }
  }

  unregister(slotId: SlotId, addonSlug: string): void {
    const existing = this.slots.get(slotId);
    if (!existing) return;

    const filtered = existing.filter(c => c.addonSlug !== addonSlug);
    if (filtered.length === 0) {
      this.slots.delete(slotId);
    } else {
      this.slots.set(slotId, filtered);
    }
  }

  async renderSlot(slotId: SlotId, locals: Record<string, unknown>): Promise<string> {
    const contributions = this.slots.get(slotId);
    if (!contributions || contributions.length === 0) return '';

    const parts: string[] = [];
    for (const contrib of contributions) {
      try {
        const html = await contrib.render(locals);
        if (html) parts.push(html);
      } catch (err: any) {
        logger.error(`Error rendering slot "${slotId}" for addon "${contrib.addonSlug}":`, err.message);
      }
    }
    return parts.join('\n');
  }

  renderSlotSync(slotId: SlotId, locals: Record<string, unknown>): string {
    const contributions = this.slots.get(slotId);
    if (!contributions || contributions.length === 0) return '';

    const parts: string[] = [];
    for (const contrib of contributions) {
      try {
        const result = contrib.render(locals);
        if (typeof result === 'string') {
          parts.push(result);
        }
      } catch (err: any) {
        logger.error(`Error rendering slot "${slotId}" for addon "${contrib.addonSlug}":`, err.message);
      }
    }
    return parts.join('\n');
  }

  clearAddonSlots(addonSlug: string): void {
    const slotIds = this.addonSlotRegistry.get(addonSlug);
    if (!slotIds) return;

    for (const slotId of slotIds) {
      this.unregister(slotId, addonSlug);
    }
    this.addonSlotRegistry.delete(addonSlug);
  }

  getSlotContributions(slotId: SlotId): SlotContribution[] {
    return [...(this.slots.get(slotId) ?? [])];
  }

  getAddonSlots(addonSlug: string): SlotId[] {
    return [...(this.addonSlotRegistry.get(addonSlug) ?? [])];
  }

  getWrapperContribution(slotId: 'layout.dashboard.wrapper' | 'layout.admin.wrapper', addonSlug: string): SlotContribution | undefined {
    const contributions = this.slots.get(slotId);
    return contributions?.find(c => c.addonSlug === addonSlug);
  }
}

export const slotRegistry = new SlotRegistry();
