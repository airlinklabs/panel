interface MenuItem {
  label: string;
  path: string;
  icon?: string;
  permission?: string;
  children?: MenuItem[];
}

declare global {
    namespace NodeJS {
      interface Global {
        uiComponentStore: Record<string, unknown>;
        name: string;
        airlinkVersion: string;
        airlinkCodename: string;
        adminMenuItems: MenuItem[];
        regularMenuItems: MenuItem[];
      }
    }
  }
  
export {};