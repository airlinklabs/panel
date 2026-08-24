import logger from './logger';
import { icon } from '../utils/icon';

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  url: string;
  priority: number;
  section?: string;
  permissions?: string[];
  isActive?: (path: string) => boolean;
  isAdminItem?: boolean;
  isAddon?: boolean;
  matchPrefix?: string;
}

export interface ServerMenuItem {
  id: string;
  label: string;
  icon: string;
  url: string;
  priority: number;
  feature?: string;
  permissions?: string[];
  isAdminItem?: boolean;
  isActive?: (path: string) => boolean;
  isDefault?: boolean;
  ownerOnly?: boolean;
  group?: string;
}

export interface ServerSection {
  id: string;
  title: string;
  priority: number;
  items: ServerSectionItem[];
}

export interface ServerSectionItem {
  id: string;
  label: string;
  value: string;
  icon?: string;
  priority: number;
  type?: 'text' | 'link' | 'button' | 'custom';
  onClick?: string;
  url?: string;
}

export class UIComponentStore {
  private sidebarItems: SidebarItem[] = [];
  private serverMenuItems: ServerMenuItem[] = [];
  private serverSections: ServerSection[] = [];
  private addonItemRegistry = new Map<
    string,
    { sidebarIds: string[]; menuIds: string[]; sectionIds: string[] }
  >();

  private ensureAddonRegistry(addonSlug: string) {
    if (!this.addonItemRegistry.has(addonSlug)) {
      this.addonItemRegistry.set(addonSlug, {
        sidebarIds: [],
        menuIds: [],
        sectionIds: [],
      });
    }
    return this.addonItemRegistry.get(addonSlug)!;
  }

  public addSidebarItem(item: SidebarItem, addonSlug?: string): void {
    const resolved: SidebarItem = addonSlug ? { ...item, isAddon: true } : item;
    const existingIndex = this.sidebarItems.findIndex(
      (i) => i.id === resolved.id,
    );
    if (existingIndex !== -1) {
      this.sidebarItems[existingIndex] = resolved;
    } else {
      this.sidebarItems.push(resolved);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.sidebarIds.includes(resolved.id))
      {reg.sidebarIds.push(resolved.id);}
    }
  }

  public removeSidebarItem(id: string): void {
    this.sidebarItems = this.sidebarItems.filter((item) => item.id !== id);
  }

  public getSidebarItems(section?: string, isAdmin?: boolean): SidebarItem[] {
    let items = this.sidebarItems;

    if (section) {
      items = items.filter((item) => item.section === section);
    }

    if (isAdmin !== undefined) {
      if (isAdmin) {
        items = items.filter((item) => item.isAdminItem === true);
      } else {
        items = items.filter((item) => item.isAdminItem !== true);
      }
    }

    return [...items].sort((a, b) => b.priority - a.priority);
  }

  public getAddonSidebarIds(): Set<string> {
    const ids = new Set<string>();
    for (const reg of this.addonItemRegistry.values()) {
      for (const id of reg.sidebarIds) {ids.add(id);}
    }
    return ids;
  }

  public getAdminSidebarGroups(): {
    section: string;
    label: string;
    items: SidebarItem[];
  }[] {
    const items = this.getSidebarItems(undefined, true);
    const sectionOrder = [
      'core',
      'infrastructure',
      'extensions',
      'configuration',
    ];
    const sectionLabels: Record<string, string> = {
      core: 'Core',
      infrastructure: 'Infrastructure',
      extensions: 'Extensions',
      configuration: 'Configuration',
    };
    const grouped = new Map<string, SidebarItem[]>();
    for (const item of items) {
      const s = item.section || 'core';
      if (!grouped.has(s)) {grouped.set(s, []);}
      grouped.get(s)!.push(item);
    }
    return sectionOrder
      .filter((s) => grouped.has(s))
      .map((s) => ({
        section: s,
        label: sectionLabels[s] || s,
        items: grouped.get(s)!,
      }));
  }

  public addServerMenuItem(item: ServerMenuItem, addonSlug?: string): void {
    const existingIndex = this.serverMenuItems.findIndex(
      (i) => i.id === item.id,
    );
    if (existingIndex !== -1) {
      this.serverMenuItems[existingIndex] = item;
    } else {
      this.serverMenuItems.push(item);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.menuIds.includes(item.id)) {reg.menuIds.push(item.id);}
    }
  }

  public removeServerMenuItem(id: string): void {
    this.serverMenuItems = this.serverMenuItems.filter(
      (item) => item.id !== id,
    );
  }

  public getServerMenuItems(
    feature?: string,
    includeDefaults = true,
  ): ServerMenuItem[] {
    let items = this.serverMenuItems;

    if (!includeDefaults) {
      items = items.filter((item) => !item.isDefault);
    }

    if (feature) {
      items = items.filter((item) => !item.feature || item.feature === feature);
    }

    return [...items].sort((a, b) => b.priority - a.priority);
  }

  public addServerSection(section: ServerSection, addonSlug?: string): void {
    const existingIndex = this.serverSections.findIndex(
      (s) => s.id === section.id,
    );
    if (existingIndex !== -1) {
      this.serverSections[existingIndex] = section;
    } else {
      this.serverSections.push(section);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.sectionIds.includes(section.id)) {reg.sectionIds.push(section.id);}
    }
  }

  public clearAddonItems(addonSlug: string): void {
    const reg = this.addonItemRegistry.get(addonSlug);
    if (!reg) {return;}
    reg.sidebarIds.forEach((id) => this.removeSidebarItem(id));
    reg.menuIds.forEach((id) => this.removeServerMenuItem(id));
    reg.sectionIds.forEach((id) => this.removeServerSection(id));
    this.addonItemRegistry.delete(addonSlug);
  }

  public removeServerSection(id: string): void {
    this.serverSections = this.serverSections.filter(
      (section) => section.id !== id,
    );
  }

  public getServerSections(): ServerSection[] {
    return [...this.serverSections].sort((a, b) => b.priority - a.priority);
  }

  public addServerSectionItem(
    sectionId: string,
    item: ServerSectionItem,
  ): void {
    const section = this.serverSections.find((s) => s.id === sectionId);
    if (section) {
      const existingIndex = section.items.findIndex((i) => i.id === item.id);
      if (existingIndex !== -1) {
        section.items[existingIndex] = item;
      } else {
        section.items.push(item);
      }
    } else {
      logger.warn(`Cannot add item to non-existent section: ${sectionId}`);
    }
  }

  public removeServerSectionItem(sectionId: string, itemId: string): void {
    const section = this.serverSections.find((s) => s.id === sectionId);
    if (section) {
      section.items = section.items.filter((item) => item.id !== itemId);
    }
  }

  public getServerSectionItems(sectionId: string): ServerSectionItem[] {
    const section = this.serverSections.find((s) => s.id === sectionId);
    if (section) {
      return [...section.items].sort((a, b) => b.priority - a.priority);
    }
    return [];
  }

  public renderComponent(
    name: string,
    locals: Record<string, unknown> = {},
  ): string {
    return `components/ui/${name}`;
  }

  public getComponentLocals(name: string, data: Record<string, unknown>) {
    return { __component: name, __componentData: data };
  }
}

export const uiComponentStore = new UIComponentStore();

export function initializeDefaultUIComponents(): void {
  // ── User workspace ──────────────────────────────────────────────────────
  uiComponentStore.addSidebarItem({
    id: 'servers',
    label: 'Dashboard',
    icon: icon('layout-grid', { class: 'w-5 h-5 mt-0.5' }),
    url: '/',
    priority: 100,
    matchPrefix: '/server',
  });

  // ── Admin: Core ─────────────────────────────────────────────────────────
  uiComponentStore.addSidebarItem({
    id: 'admin-overview',
    label: 'Overview',
    icon: icon('layout-grid', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/overview',
    priority: 90,
    isAdminItem: true,
    section: 'core',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-servers',
    label: 'Servers',
    icon: icon('server', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/servers',
    priority: 88,
    isAdminItem: true,
    section: 'core',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-users',
    label: 'Users',
    icon: icon('users', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/users',
    priority: 86,
    isAdminItem: true,
    section: 'core',
  });

  // ── Admin: Infrastructure ───────────────────────────────────────────────
  uiComponentStore.addSidebarItem({
    id: 'admin-nodes',
    label: 'Nodes',
    icon: icon('network', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/nodes',
    priority: 80,
    isAdminItem: true,
    section: 'infrastructure',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-activity',
    label: 'Activity Log',
    icon: icon('activity', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/activity',
    priority: 78,
    isAdminItem: true,
    section: 'infrastructure',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-images',
    label: 'Images',
    icon: icon('box', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/images',
    priority: 76,
    isAdminItem: true,
    section: 'infrastructure',
  });

  // ── Admin: Extensions ───────────────────────────────────────────────────
  uiComponentStore.addSidebarItem({
    id: 'admin-addons',
    label: 'Addons',
    icon: icon('puzzle', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/addons',
    priority: 70,
    isAdminItem: true,
    section: 'extensions',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-apikeys',
    label: 'API Keys',
    icon: icon('key', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/apikeys',
    priority: 68,
    isAdminItem: true,
    section: 'extensions',
  });

  // ── Admin: Configuration ────────────────────────────────────────────────
  uiComponentStore.addSidebarItem({
    id: 'admin-settings',
    label: 'Settings',
    icon: icon('settings', { class: 'w-5 h-5 mt-0.5', strokeWidth: 1.5 }),
    url: '/admin/settings',
    priority: 60,
    isAdminItem: true,
    section: 'configuration',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-analytics',
    label: 'Analytics',
    icon: icon('chart-column', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/analytics',
    priority: 58,
    isAdminItem: true,
    section: 'configuration',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-databases',
    label: 'Databases',
    icon: icon('database', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/databases',
    priority: 56,
    isAdminItem: true,
    section: 'configuration',
  });
  uiComponentStore.addSidebarItem({
    id: 'admin-mounts',
    label: 'Mounts',
    icon: icon('box', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/mounts',
    priority: 54,
    isAdminItem: true,
    section: 'configuration',
  });

  // ── Server menu items ──────────────────────────────────────────────────
  uiComponentStore.addServerMenuItem({
    id: 'console',
    label: 'Console',
    icon: icon('square-terminal', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid',
    priority: 100,
    isDefault: true,
    group: 'run',
  });
  uiComponentStore.addServerMenuItem({
    id: 'files',
    label: 'Files',
    icon: icon('folder', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/files',
    priority: 90,
    isDefault: true,
    group: 'data',
  });
  uiComponentStore.addServerMenuItem({
    id: 'players',
    label: 'Players',
    icon: icon('users', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/players',
    priority: 80,
    feature: 'players',
    isDefault: true,
    group: 'run',
  });
  uiComponentStore.addServerMenuItem({
    id: 'schedules',
    label: 'Schedules',
    icon: icon('calendar', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/schedules',
    priority: 78,
    isDefault: true,
    group: 'data',
  });
  uiComponentStore.addServerMenuItem({
    id: 'worlds',
    label: 'Worlds',
    icon: icon('globe', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/worlds',
    priority: 75,
    feature: 'worlds',
    isDefault: true,
    group: 'manage',
  });
  uiComponentStore.addServerMenuItem({
    id: 'startup',
    label: 'Startup',
    icon: icon('play', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/startup',
    priority: 70,
    isDefault: true,
    group: 'manage',
  });
  uiComponentStore.addServerMenuItem({
    id: 'backups',
    label: 'Backups',
    icon: icon('database-backup', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/backups',
    priority: 65,
    isDefault: true,
    group: 'data',
  });
  uiComponentStore.addServerMenuItem({
    id: 'subusers',
    label: 'Subusers',
    icon: icon('users', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/subusers',
    priority: 62,
    ownerOnly: true,
    group: 'manage',
  });
  uiComponentStore.addServerMenuItem({
    id: 'databases',
    label: 'Databases',
    icon: icon('database', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/databases',
    priority: 64,
    isDefault: true,
    group: 'data',
  });
  uiComponentStore.addServerMenuItem({
    id: 'settings',
    label: 'Settings',
    icon: icon('settings', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/settings',
    priority: 60,
    isDefault: true,
    group: 'settings',
  });
  uiComponentStore.addServerMenuItem({
    id: 'admin',
    label: 'Admin',
    icon: icon('square-arrow-up-right', {
      class: 'size-5 mb-0.5 inline-flex mr-1',
    }),
    url: '/admin/servers/edit/:id',
    priority: 55,
    isAdminItem: true,
    isDefault: true,
    group: 'settings',
  });
}

export default {
  uiComponentStore,
  initializeDefaultUIComponents,
};
