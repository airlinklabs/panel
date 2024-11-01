import { Router, Request, Response } from 'express';
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
  router: Router; // Use router instead of init method
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

// Create the router instance
const router = Router();

// Module information
const exampleModule: Module = {
  info: {
    name: 'Auth Module',
    description: 'This file is for authentication and authorization of users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },
  router: router, // Expose the router
};

// Session configuration middleware
router.use(session({
  secret: 'airlink',
  resave: false,
  saveUninitialized: true,
}));

// Render login page with error messages if present
router.get('/login', (req: Request, res: Response) => {
  const errorMessage = req.query.err === 'incorrect_password' 
    ? 'Invalid login credentials. Please try again.' 
    : '';
  res.render('auth/login', { errorMessage });
});

// Handle logout
router.get('/logout', (req: Request, res: Response) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// Export the module
export default exampleModule;
