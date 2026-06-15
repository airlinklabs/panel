import type { ApiKey } from '../generated/prisma/client';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      nonce?: string;
      lang?: string;
      translations?: Record<string, unknown>;
      cookies?: Record<string, string>;
    }
  }
}

export {};
