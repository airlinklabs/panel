declare global {
    namespace NodeJS {
      interface Global {
        uiComponentStore: {
          getSidebarItems: (section?: string, isAdmin?: boolean) => {
            id: string;
            label: string;
            url: string;
            icon: string;
            matchPrefix?: string;
            isAddon?: boolean;
          }[];
        };
        name: string;
        airlinkVersion: string;
        adminMenuItems: { id: string; label: string; url: string; icon: string }[];
        regularMenuItems: { id: string; label: string; url: string; icon: string }[];
      }
    }
  }
  
export {};