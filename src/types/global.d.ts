import type { SidebarItem, UIComponentStore } from '../handlers/uiComponentHandler';

declare global {
  // Globals attached by the app composition root (src/app.ts). Declared as
  // `var` on the global object so they are reachable as global.<name> anywhere
  // in the process, matching the pattern already used for serverStoppingStates.
  var uiComponentStore: UIComponentStore;
  var appName: string;
  var airlinkVersion: string;
  var airlinkCodename: string;
  var adminMenuItems: SidebarItem[];
  var regularMenuItems: SidebarItem[];
  namespace NodeJS {
    interface Global {
      uiComponentStore: UIComponentStore;
      appName: string;
      airlinkVersion: string;
      airlinkCodename: string;
      adminMenuItems: SidebarItem[];
      regularMenuItems: SidebarItem[];
    }
  }
}

export {};
