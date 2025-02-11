import 'express';
<<<<<<< HEAD
import { Server, Users } from '@prisma/client';
=======
>>>>>>> 589f8dca2f23529e9a3471e72955f7db4a489313

declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
<<<<<<< HEAD
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
=======
    }
  }
}
>>>>>>> 589f8dca2f23529e9a3471e72955f7db4a489313
