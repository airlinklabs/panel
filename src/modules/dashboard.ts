import { Router, Request, Response } from 'express';
import { Module } from '../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string; // Make message optional to avoid TypeScript errors
}

interface User {
  username: string;
  id: number;
  description: string;
  isAdmin: boolean;
  email: string;
}

const userObject: User = {
  username: 'John Doe',
  description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  id: 1,
  isAdmin: false,
  email: 'IyZxg@example.com',
};

const dashboardModule: Module = {
  info: {
    name: 'Dashboard Module',
    description: 'This file is for dashboard functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },



  router: () => {
    const router = Router();

    router.get('/dashboard', async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {}; // Define the errorMessage with the type

      // Assuming you have a way to identify the user, for example via session

      const userIdString = req.session.id; // Assuming this is how you get the user ID from the session

      // Check if userId exists
      if (!userIdString) {
        errorMessage.message = 'User not authenticated.';
        return res.render('user/dashboard', { errorMessage, user: userObject, req });
      }

      const userId = parseInt(userIdString, 10); // Adjust according to how you store the user ID in session

      if (!userId) {
        errorMessage.message = 'User not authenticated.';
        return res.render('user/dashboard', { errorMessage, user: userObject, req });
      }

      try {
        const user = await prisma.users.findUnique({
          where: { id: userId }, // Now userId is a number
        });

        if (!user) {
          errorMessage.message = 'User not found.';
          return res.render('user/dashboard', { errorMessage, user: userObject, req });
        }
        console.log('test:' + user);

        res.render('user/dashboard', { errorMessage, user, req });
      } catch (error) {
        console.error('Error fetching user:', error);
        errorMessage.message = 'Error fetching user data.';
        res.render('user/dashboard', { errorMessage, user: userObject, req });
      }
    });

    return router;
  },
};

export default dashboardModule;
