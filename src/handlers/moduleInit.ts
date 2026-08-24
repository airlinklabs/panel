
import type { Router } from 'express';

interface ModuleInfo {
  name: string;
  description: string;
  version: string;
  moduleVersion: string;
  author: string;
  license: string;
}

export interface Module {
  info: ModuleInfo;
  router: (applyWs?: (router: Router) => void) => Router;
}
