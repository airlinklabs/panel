import type { SidebarItem, UIComponentStore } from '../handlers/uiComponentHandler';

interface AdminSidebarGroup {
  section: string;
  label: string;
  items: SidebarItem[];
}

declare global {
  var uiComponentStore: UIComponentStore;
  var appName: string;
  var airlinkVersion: string;
  var airlinkCodename: string;
  var adminMenuItems: SidebarItem[];
  var regularMenuItems: SidebarItem[];
  var adminSidebarGroups: AdminSidebarGroup[];
  namespace NodeJS {
    interface Global {
      uiComponentStore: UIComponentStore;
      appName: string;
      airlinkVersion: string;
      airlinkCodename: string;
      adminMenuItems: SidebarItem[];
      regularMenuItems: SidebarItem[];
      adminSidebarGroups: AdminSidebarGroup[];
    }
  }
}

export {};
