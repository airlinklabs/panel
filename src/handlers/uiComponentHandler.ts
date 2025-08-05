import logger from './logger';

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
}

export interface ServerMenuItem {
  id: string;
  label: string;
  icon: string;
  url: string;
  priority: number;
  feature?: string;
  permissions?: string[];
  isActive?: (path: string) => boolean;
  isDefault?: boolean;
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

class UIComponentStore {
  private sidebarItems: SidebarItem[] = [];
  private serverMenuItems: ServerMenuItem[] = [];
  private serverSections: ServerSection[] = [];
  public addSidebarItem(item: SidebarItem): void {
    const existingIndex = this.sidebarItems.findIndex(i => i.id === item.id);
    if (existingIndex !== -1) {
      this.sidebarItems[existingIndex] = item;
      logger.debug(`Updated sidebar item: ${item.id}`);
    } else {
      this.sidebarItems.push(item);
      logger.debug(`Added sidebar item: ${item.id}`);
    }
  }

  public removeSidebarItem(id: string): void {
    this.sidebarItems = this.sidebarItems.filter(item => item.id !== id);
    logger.debug(`Removed sidebar item: ${id}`);
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
  public addServerMenuItem(item: ServerMenuItem): void {
    const existingIndex = this.serverMenuItems.findIndex(i => i.id === item.id);
    if (existingIndex !== -1) {
      this.serverMenuItems[existingIndex] = item;
      logger.debug(`Updated server menu item: ${item.id}`);
    } else {
      this.serverMenuItems.push(item);
      logger.debug(`Added server menu item: ${item.id}`);
    }
  }

  public removeServerMenuItem(id: string): void {
    this.serverMenuItems = this.serverMenuItems.filter(item => item.id !== id);
    logger.debug(`Removed server menu item: ${id}`);
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

  public addServerSection(section: ServerSection): void {
    const existingIndex = this.serverSections.findIndex(s => s.id === section.id);
    if (existingIndex !== -1) {
      this.serverSections[existingIndex] = section;
      logger.debug(`Updated server section: ${section.id}`);
    } else {
      this.serverSections.push(section);
      logger.debug(`Added server section: ${section.id}`);
    }
  }

  public removeServerSection(id: string): void {
    this.serverSections = this.serverSections.filter(section => section.id !== id);
    logger.debug(`Removed server section: ${id}`);
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
        logger.debug(`Updated server section item: ${item.id} in section ${sectionId}`);
      } else {
        section.items.push(item);
        logger.debug(`Added server section item: ${item.id} to section ${sectionId}`);
      }
    } else {
      logger.warn(`Cannot add item to non-existent section: ${sectionId}`);
    }
  }

  public removeServerSectionItem(sectionId: string, itemId: string): void {
    const section = this.serverSections.find(s => s.id === sectionId);
    if (section) {
      section.items = section.items.filter(item => item.id !== itemId);
      logger.debug(`Removed server section item: ${itemId} from section ${sectionId}`);
    }
  }

  public getServerSectionItems(sectionId: string): ServerSectionItem[] {
    const section = this.serverSections.find(s => s.id === sectionId);
    if (section) {
      return [...section.items].sort((a, b) => b.priority - a.priority);
    }
    return [];
  }
}

export const uiComponentStore = new UIComponentStore();

export function initializeDefaultUIComponents(): void {
  uiComponentStore.addSidebarItem({
    id: 'servers',
    label: 'Servers',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 mt-0.5"><path d="M12.378 1.602a.75.75 0 0 0-.756 0L3 6.632l9 5.25 9-5.25-8.622-5.03ZM21.75 7.93l-9 5.25v9l8.628-5.032a.75.75 0 0 0 .372-.648V7.93ZM11.25 22.18v-9l-9-5.25v8.57a.75.75 0 0 0 .372.648l8.628 5.033Z" /></svg>',
    url: '/',
    priority: 100
  });

  uiComponentStore.addSidebarItem({
    id: 'account',
    label: 'Account',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mt-0.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>',
    url: '/account',
    priority: 90
  });

  uiComponentStore.addServerMenuItem({
    id: 'console',
    label: 'Console',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path fill-rule="evenodd" d="M2.25 6a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V6Zm3.97.97a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 0 1-1.06-1.06l1.72-1.72-1.72-1.72a.75.75 0 0 1 0-1.06Zm4.28 4.28a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd" /></svg>',
    url: '/server/:uuid',
    priority: 100,
    isDefault: true
  });

  uiComponentStore.addSidebarItem({
    id: 'analytics',
    label: 'Analytics',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mt-0.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>',
    url: '/admin/analytics',
    priority: 85,
    isAdminItem: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'files',
    label: 'Files',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path d="M19.906 9c.382 0 .749.057 1.094.162V9a3 3 0 0 0-3-3h-3.879a.75.75 0 0 1-.53-.22L11.47 3.66A2.25 2.25 0 0 0 9.879 3H6a3 3 0 0 0-3 3v3.162A3.756 3.756 0 0 1 4.094 9h15.812ZM4.094 10.5a2.25 2.25 0 0 0-2.227 2.568l.857 6A2.25 2.25 0 0 0 4.951 21H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-2.227-2.568H4.094Z" /></svg>',
    url: '/server/:uuid/files',
    priority: 90,
    isDefault: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'players',
    label: 'Players',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>',
    url: '/server/:uuid/players',
    priority: 80,
    feature: 'players',
    isDefault: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'worlds',
    label: 'Worlds',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="m20.893 13.393-1.135-1.135a2.252 2.252 0 0 1-.421-.585l-1.08-2.16a.414.414 0 0 0-.663-.107.827.827 0 0 1-.812.21l-1.273-.363a.89.89 0 0 0-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 0 1-1.81 1.025 1.055 1.055 0 0 1-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 0 1-1.383-2.46l.007-.042a2.25 2.25 0 0 1 .29-.787l.09-.15a2.25 2.25 0 0 1 2.37-1.048l1.178.236a1.125 1.125 0 0 0 1.302-.795l.208-.73a1.125 1.125 0 0 0-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 0 1-1.591.659h-.18c-.249 0-.487.1-.662.274a.931.931 0 0 1-1.458-1.137l1.411-2.353a2.25 2.25 0 0 0 .286-.76m11.928 9.869A9 9 0 0 0 8.965 3.525m11.928 9.868A9 9 0 1 1 8.965 3.525" /></svg>',
    url: '/server/:uuid/worlds',
    priority: 75,
    feature: 'worlds',
    isDefault: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'startup',
    label: 'Startup',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>',
    url: '/server/:uuid/startup',
    priority: 70,
    isDefault: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'backups',
    label: 'Backups',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',
    url: '/server/:uuid/backups',
    priority: 65,
    isDefault: true
  });

  uiComponentStore.addServerMenuItem({
    id: 'settings',
    label: 'Settings',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5 mb-0.5 inline-flex mr-1"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd" /></svg>',
    url: '/server/:uuid/settings',
    priority: 60,
    isDefault: true
  });
}

export default {
  uiComponentStore,
  initializeDefaultUIComponents
};
