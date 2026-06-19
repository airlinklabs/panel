export interface AddonApi {
  registerRoute: (path: string, router: any) => void;
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  prisma: any;
  config: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  ui: {
    addSidebarItem: (item: any) => void;
    removeSidebarItem: (id: string) => void;
  };
  middleware: {
    isAuthenticated: any;
    csrfProtection: any;
  };
  viewsPath: string;
  renderView: (viewName: string, data?: any, isMobile?: boolean) => Promise<string>;
  getComponentPath: (p: string) => string;
}
