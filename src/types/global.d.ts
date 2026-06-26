declare global {
    namespace NodeJS {
      interface Global {
        uiComponentStore: {
          getSidebarItems: (section?: string, isAdmin?: boolean) => Array<{
            id: string;
            label: string;
            url: string;
            icon: string;
            matchPrefix?: string;
            isAddon?: boolean;
          }>;
        };
        name: string;
        airlinkVersion: string;
        adminMenuItems: Array<{ id: string; label: string; url: string; icon: string }>;
        regularMenuItems: Array<{ id: string; label: string; url: string; icon: string }>;
      }
    }
  }
  
export {};