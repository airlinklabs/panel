import express, { Express, Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import session from 'express-session';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Define module info interface
interface ModuleInfo {
  name: string;
  description: string;
  version: string;
  moduleVersion: string;
  author: string;
  license: string;
}

// Define module interface
interface Module {
  info: ModuleInfo;
  router: Router;
  express: Express;
}

// Extend session interface to include user data
declare module 'express-session' {
  interface SessionData {
    user: {
      id: number;
      email: string;
      isAdmin: boolean;
    };
  }
}

const app: Express = express();
const router = Router();

// Module information
const moduleInfo: ModuleInfo = {
  name: 'Auth Service Module',
  description: 'This file is for authentication and authorization of users.',
  version: '1.0.0',
  moduleVersion: '1.0.0',
  author: 'AirLinkLab',
  license: 'MIT',
};

const moduleExport: Module = {
    info: moduleInfo,
    router: router,
    express: app,  // Include the Express instance here
  };

// Session configuration middleware
router.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret', // Provide a default secret
  resave: false,
  saveUninitialized: true,
}));

// Middleware for JSON body parsing
router.use(express.json());

// Helper function to handle login logic
const handleLogin = async (identifier: string, password: string) => {
  try {
    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      return { success: false, error: 'user_not_found' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      return { success: true, user };
    }

    return { success: false, error: 'incorrect_password' };
  } catch (error) {
    console.error('Database error:', error);
    return { success: false, error: 'database_error' }; // Return a generic error message
  }
};

// Login route
router.get('/auth/login', (req: Request, res: Response) => {
    // Use req.query to retrieve identifier and password
    const { identifier, password }: { identifier?: string; password?: string } = req.query;
  
    // Validate identifier and password
    if (!identifier || !password) {
      return res.redirect('/login?err=missing_credentials');
    }
  
    // Call handleLogin function and handle Promises
    handleLogin(identifier, password)
      .then((result) => {
        // Check if the login was successful and user is defined
        if (result.success && result.user) {
          req.session.user = {
            id: result.user.id,
            email: result.user.email,
            isAdmin: result.user.isAdmin,
          };
          return res.redirect('/');
        }
  
        // Redirect with the appropriate error if login failed
        return res.redirect(`/login?err=${result.error}`);
      })
      .catch((error) => {
        console.error('Login error:', error);
        return res.status(500).send('Server error. Please try again later.');
      });
  });
  
  

// Export the module
export default moduleExport;
