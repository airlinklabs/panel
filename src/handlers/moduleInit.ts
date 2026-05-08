import { Router } from 'express';

export interface Module {
  router: () => Router;
}
