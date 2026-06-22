import path from 'path';
import fs from 'fs';

export type ViewportMode = 'desktop' | 'mobile';

export type ComponentName =
  | 'header'
  | 'footer'
  | 'template'
  | 'modal'
  | 'toast'
  | 'serverHeader'
  | 'serverTemplate'
  | 'settingsTemplate'
  | 'tabComponent'
  | 'store'
  | 'sftp'
  | 'csrf'
  | 'installHeader'
  | 'imageViewer'
  | 'loadingState'
  | 'loadingPopup'
  | 'pageTitle'
  | 'serverFeatures'
  | 'uiButton';

export interface AddonComponents {
  header: string;
  footer: string;
  template: string;
  modal: string;
  toast: string;
  serverHeader: string;
  serverTemplate: string;
  settingsTemplate: string;
  tabComponent: string;
  store: string;
  sftp: string;
  csrf: string;
  installHeader: string;
  imageViewer: string;
  loadingState: string;
  loadingPopup: string;
  pageTitle: string;
  serverFeatures: string;
  uiButton: string;
}

const COMPONENT_REGISTRY: Record<ComponentName, (panelRoot: string, viewport: ViewportMode) => string> = {
  header: (r, v) => path.join(r, `views/${v}/components/header`),
  footer: (r, v) => path.join(r, `views/${v}/components/footer`),
  template: (r, v) => path.join(r, `views/${v}/components/template`),
  modal: (r, v) => path.join(r, `views/${v}/components/modal`),
  toast: (r, v) => path.join(r, `views/${v}/components/toast`),
  serverHeader: (r, v) => path.join(r, `views/${v}/components/serverHeader`),
  serverTemplate: (r, v) => path.join(r, `views/${v}/components/serverTemplate`),
  settingsTemplate: (r, v) => path.join(r, `views/${v}/components/settingsTemplate`),
  tabComponent: (r, v) => path.join(r, `views/${v}/components/tabComponent`),
  store: (r, v) => path.join(r, `views/${v}/components/store`),
  sftp: (r, v) => path.join(r, `views/${v}/components/sftp`),
  csrf: (r, v) => path.join(r, `views/${v}/components/csrf`),
  installHeader: (r, v) => path.join(r, `views/${v}/components/installHeader`),
  imageViewer: (r, v) => path.join(r, `views/${v}/components/imageViewer`),
  loadingState: (r, v) => path.join(r, `views/${v}/components/loading-state`),
  loadingPopup: (r, v) => path.join(r, `views/${v}/components/loadingPopup`),
  pageTitle: (r, v) => path.join(r, `views/${v}/components/pageTitle`),
  serverFeatures: (r, v) => path.join(r, `views/${v}/components/serverFeatures`),
  uiButton: (r, v) => path.join(r, `views/${v}/components/ui/button`),
};

const VALID_COMPONENT_NAMES = new Set<string>(Object.keys(COMPONENT_REGISTRY));

export class AddonComponentResolver {
  private viewsPath: string;
  private panelRoot: string;

  constructor(viewsPath: string) {
    this.viewsPath = viewsPath;
    this.panelRoot = path.resolve(viewsPath, '..');
  }

  resolveViewport(requested: ViewportMode | 'auto', cookieViewport?: string): ViewportMode {
    if (requested !== 'auto') return requested;
    return cookieViewport === 'mobile' ? 'mobile' : 'desktop';
  }

  getComponent(name: string, viewport: ViewportMode = 'desktop'): string | null {
    if (!VALID_COMPONENT_NAMES.has(name)) return null;
    const resolver = COMPONENT_REGISTRY[name as ComponentName];
    return resolver(this.panelRoot, viewport);
  }

  getComponents(viewport: ViewportMode = 'desktop'): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, resolver] of Object.entries(COMPONENT_REGISTRY)) {
      result[name] = resolver(this.panelRoot, viewport);
    }
    return result;
  }

  getComponentPath(componentRelativePath: string): string {
    return path.join(this.panelRoot, componentRelativePath);
  }

  resolveViewPath(viewName: string, addonViewsPath: string, viewport: ViewportMode): string | null {
    const viewportPath = path.join(addonViewsPath, viewport, viewName);
    if (fs.existsSync(viewportPath)) return viewportPath;

    const fallbackPath = path.join(addonViewsPath, viewName);
    if (fs.existsSync(fallbackPath)) return fallbackPath;

    return null;
  }
}
