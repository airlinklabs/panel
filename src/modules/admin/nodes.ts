import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/admin/nodes', isAuthenticated, (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.redirect('/login');
      }

      prisma.users.findUnique({ where: { id: userId } })
        .then(user => {
          if (!user) {
            return res.redirect('/login');
          }

          if (!user.isAdmin) {
            return res.redirect('/dashboard');
          }

          res.render('admin/nodes', { errorMessage, user, req });
        })
        .catch(error => {
          console.error('Error fetching user:', error);
          return res.redirect('/login');
        });
    });

    function generateApiKey(length: number): string {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
      }
      return result;
    }

    router.post('/admin/nodes', isAuthenticated, (req: Request, res: Response): void => {
      const { name, address } = req.body;
    
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.redirect('/login');
      }
    
      prisma.users.findUnique({ where: { id: userId } })
        .then(user => {
          if (!user || !user.isAdmin) {
            res.redirect('/dashboard');
            return null; 
          }
    
          if (!name || !address) {
            res.status(400).json({ message: 'Name und Adresse sind erforderlich.' });
            return null;
          }
    
          const apiKey = generateApiKey(32);
          return prisma.node.create({
            data: {
              name,
              address,
              apiKey, // idk how to fix 
              createdAt: new Date(),
            },
          });
        })
        .then(node => {
          if (node) {
            res.json(node);
          } else {
            res.status(500).json({ message: 'Error when creating the node.' });
          }
        })
        .catch(error => {
          console.error('Error when creating the node:', error);
          res.status(500).json({ message: 'Error when creating the node.' });
        });
    });

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
