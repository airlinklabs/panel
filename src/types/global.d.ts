declare global {
    namespace NodeJS {
      interface Global {
        uiComponentStore: any;
        name: string;
        airlinkVersion: string;
        airlinkCodename: string;
        adminMenuItems: any[];
        regularMenuItems: any[];
      }
    }
  }
  
export {};