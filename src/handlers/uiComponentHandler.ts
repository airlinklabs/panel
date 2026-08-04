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
  private addonItemRegistry = new Map<string, { sidebarIds: string[], menuIds: string[], sectionIds: string[] }>();

  private ensureAddonRegistry(addonSlug: string) {
    if (!this.addonItemRegistry.has(addonSlug)) {
      this.addonItemRegistry.set(addonSlug, { sidebarIds: [], menuIds: [], sectionIds: [] });
    }
    return this.addonItemRegistry.get(addonSlug)!;
  }

  public addSidebarItem(item: SidebarItem, addonSlug?: string): void {
    const resolved: SidebarItem = addonSlug ? { ...item, isAddon: true } : item;
    const existingIndex = this.sidebarItems.findIndex(i => i.id === resolved.id);
    if (existingIndex !== -1) {
      this.sidebarItems[existingIndex] = resolved;
    } else {
      this.sidebarItems.push(resolved);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.sidebarIds.includes(resolved.id)) reg.sidebarIds.push(resolved.id);
    }
  }

  public removeSidebarItem(id: string): void {
    this.sidebarItems = this.sidebarItems.filter(item => item.id !== id);
  }

  public getSidebarItems(section?: string, isAdmin?: boolean): SidebarItem[] {
    let items = this.sidebarItems;

    if (section) {
      items = items.filter(item => item.section === section);
    }

    if (isAdmin !== undefined) {
      if (isAdmin) {
        items = items.filter(item => item.isAdminItem === true);
      } else {
        items = items.filter(item => item.isAdminItem !== true);
      }
    }

    return [...items].sort((a, b) => b.priority - a.priority);
  }

  public getAddonSidebarIds(): Set<string> {
    const ids = new Set<string>();
    for (const reg of this.addonItemRegistry.values()) {
      for (const id of reg.sidebarIds) ids.add(id);
    }
    return ids;
  }

  public addServerMenuItem(item: ServerMenuItem, addonSlug?: string): void {
    const existingIndex = this.serverMenuItems.findIndex(i => i.id === item.id);
    if (existingIndex !== -1) {
      this.serverMenuItems[existingIndex] = item;
    } else {
      this.serverMenuItems.push(item);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.menuIds.includes(item.id)) reg.menuIds.push(item.id);
    }
  }

  public removeServerMenuItem(id: string): void {
    this.serverMenuItems = this.serverMenuItems.filter(item => item.id !== id);
  }

  public getServerMenuItems(feature?: string, includeDefaults: boolean = true): ServerMenuItem[] {
    let items = this.serverMenuItems;

    if (!includeDefaults) {
      items = items.filter(item => !item.isDefault);
    }

    if (feature) {
      items = items.filter(item => !item.feature || item.feature === feature);
    }

    return [...items].sort((a, b) => b.priority - a.priority);
  }

  public addServerSection(section: ServerSection, addonSlug?: string): void {
    const existingIndex = this.serverSections.findIndex(s => s.id === section.id);
    if (existingIndex !== -1) {
      this.serverSections[existingIndex] = section;
    } else {
      this.serverSections.push(section);
    }
    if (addonSlug) {
      const reg = this.ensureAddonRegistry(addonSlug);
      if (!reg.sectionIds.includes(section.id)) reg.sectionIds.push(section.id);
    }
  }

  public clearAddonItems(addonSlug: string): void {
    const reg = this.addonItemRegistry.get(addonSlug);
    if (!reg) return;
    reg.sidebarIds.forEach(id => this.removeSidebarItem(id));
    reg.menuIds.forEach(id => this.removeServerMenuItem(id));
    reg.sectionIds.forEach(id => this.removeServerSection(id));
    this.addonItemRegistry.delete(addonSlug);
  }

  public removeServerSection(id: string): void {
    this.serverSections = this.serverSections.filter(section => section.id !== id);
  }

  public getServerSections(): ServerSection[] {
    return [...this.serverSections].sort((a, b) => b.priority - a.priority);
  }

  public addServerSectionItem(sectionId: string, item: ServerSectionItem): void {
    const section = this.serverSections.find(s => s.id === sectionId);
    if (section) {
      const existingIndex = section.items.findIndex(i => i.id === item.id);
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
    const section = this.serverSections.find(s => s.id === sectionId);
    if (section) {
      section.items = section.items.filter(item => item.id !== itemId);
    }
  }

  public getServerSectionItems(sectionId: string): ServerSectionItem[] {
    const section = this.serverSections.find(s => s.id === sectionId);
    if (section) {
      return [...section.items].sort((a, b) => b.priority - a.priority);
    }
    return [];
  }

  public renderComponent(name: string, locals: Record<string, unknown> = {}): string {
    return `components/ui/${name}`;
  }

  public getComponentLocals(name: string, data: Record<string, unknown>) {
    return { __component: name, __componentData: data };
  }
}

export const uiComponentStore = new UIComponentStore();

export function initializeDefaultUIComponents(): void {
  uiComponentStore.addSidebarItem({
    id: 'servers',
    label: 'Dashboard',
    icon: icon('layout-grid', { class: 'w-5 h-5 mt-0.5' }),
    url: '/',
    priority: 100,
    matchPrefix: '/server'
  });

  uiComponentStore.addServerMenuItem({
    id: 'console',
    label: 'Console',
    icon: icon('square-terminal', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid',
    priority: 100,
    isDefault: true,
    group: 'run'
  });

  uiComponentStore.addSidebarItem({
    id: 'analytics',
    label: 'Analytics',
    icon: icon('chart-column', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/analytics',
    priority: 85,
    isAdminItem: true
  });
  uiComponentStore.addSidebarItem({
    id: 'databases',
    label: 'Databases',
    icon: icon('database', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/databases',
    priority: 50,
    isAdminItem: true
  });
  uiComponentStore.addSidebarItem({
    id: 'mounts',
    label: 'Mounts',
    icon: icon('box', { class: 'w-5 h-5 mt-0.5' }),
    url: '/admin/mounts',
    priority: 45,
    isAdminItem: true
  });
  uiComponentStore.addServerMenuItem({
    id: 'admin',
    label: 'Admin',
    icon: icon('square-arrow-up-right', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/admin/servers/edit/:id',
    priority: 55,
    isAdminItem: true,
    isDefault: true,
    group: 'settings'
  });

  uiComponentStore.addServerMenuItem({
    id: 'files',
    label: 'Files',
    icon: icon('folder', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/files',
    priority: 90,
    isDefault: true,
    group: 'data'
  });

  uiComponentStore.addServerMenuItem({
    id: 'players',
    label: 'Players',
    icon: icon('users', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/players',
    priority: 80,
    feature: 'players',
    isDefault: true,
    group: 'run'
  });

  uiComponentStore.addServerMenuItem({
    id: 'schedules',
    label: 'Schedules',
    icon: icon('calendar', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/schedules',
    priority: 78,
    isDefault: true,
    group: 'data'
  });

  uiComponentStore.addServerMenuItem({
    id: 'worlds',
    label: 'Worlds',
    icon: icon('globe', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/worlds',
    priority: 75,
    feature: 'worlds',
    isDefault: true,
    group: 'manage'
  });

  uiComponentStore.addServerMenuItem({
    id: 'startup',
    label: 'Startup',
    icon: icon('play', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/startup',
    priority: 70,
    isDefault: true,
    group: 'manage'
  });

  uiComponentStore.addServerMenuItem({
    id: 'backups',
    label: 'Backups',
    icon: icon('database-backup', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/backups',
    priority: 65,
    isDefault: true,
    group: 'data'
  });

  uiComponentStore.addServerMenuItem({
    id: 'subusers',
    label: 'Subusers',
    icon: icon('users', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/subusers',
    priority: 62,
    ownerOnly: true,
    group: 'manage'
  });

  uiComponentStore.addServerMenuItem({
    id: 'databases',
    label: 'Databases',
    icon: icon('database', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/databases',
    priority: 64,
    isDefault: true,
    group: 'data'
  });

uiComponentStore.addServerMenuItem({
    id: 'settings',
    label: 'Settings',
    icon: icon('settings', { class: 'size-5 mb-0.5 inline-flex mr-1' }),
    url: '/server/:uuid/settings',
    priority: 60,
    isDefault: true,
    group: 'settings'
  });
}

export default {
  uiComponentStore,
  initializeDefaultUIComponents
};
