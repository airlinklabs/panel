import { ApiKey } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

export {};
