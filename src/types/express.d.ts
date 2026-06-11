import { ApiKey } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      nonce?: string;
      csrfToken?: () => string;
    }
    interface Response {
      locals: {
        nonce?: string;
        csrfToken?: string;
        [key: string]: unknown;
      };
    }
  }
}

export {};
