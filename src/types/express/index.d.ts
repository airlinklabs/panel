import 'express';
import { Server, Users } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
      translations?: { [key: string]: string };
      session: {
        user?: {
          id: number;
          isAdmin: boolean;
        };
      };
    }
  }
}

interface ServerUpdateData {
  name: string;
  description: string;
  nodeId: number;
  Memory: number;
  Cpu: number;
  Storage: number;
  ownerId: number;
}

interface ServerCreateData extends ServerUpdateData {
  imageId: number;
  Ports: string;
  dockerImage: string;
  variables: Array<{
    env: string;
    value: any;
    type: string;
  }>;
}

export { ServerUpdateData, ServerCreateData };
