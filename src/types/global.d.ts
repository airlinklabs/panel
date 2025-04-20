declare global {
    namespace NodeJS {
      interface Global {
        uiComponentStore: any;
        name: string;
        airlinkVersion: string;
        adminMenuItems: any[];
        regularMenuItems: any[];
      }
    }
  }
  
export {};