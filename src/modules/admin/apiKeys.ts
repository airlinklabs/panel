import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permisions';

const prisma = new PrismaClient();


registerPermission('airlink.admin.apikeys.view');
registerPermission('airlink.admin.apikeys.create');
registerPermission('airlink.admin.apikeys.delete');
registerPermission('airlink.admin.apikeys.edit');
registerPermission('airlink.admin.api.docs.view');

function generateApiKey(length: number): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

const coreModule: Module = {
  info: {
    name: 'API Keys Module',
    description: 'This module handles API key management.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();


    router.get(
      '/admin/api/docs',
      isAuthenticated(true, 'airlink.admin.api.docs.view'),
      async (req: Request, res: Response) => {
        try {
          const settings = await prisma.settings.findFirst();
          const apiKeys = await prisma.apiKey.findMany({
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          });

          const apiEndpoints = [
            {
              category: 'Users',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1/users',
                  description: 'Get a list of all users',
                  permission: 'airlink.api.users.read',
                  responseExample: `{
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "isAdmin": true,
      "description": "Administrator account",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}`
                },
                {
                  method: 'GET',
                  path: '/api/v1/users/:id',
                  description: 'Get details for a specific user',
                  permission: 'airlink.api.users.read',
                  responseExample: `{
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "isAdmin": true,
    "description": "Administrator account",
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}`
                }
              ]
            },
            {
              category: 'Servers',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1/servers',
                  description: 'Get a list of all servers',
                  permission: 'airlink.api.servers.read',
                  responseExample: `{
  "data": [
    {
      "id": 1,
      "UUID": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Minecraft Server",
      "description": "A Minecraft server",
      "owner": {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com"
      },
      "node": {
        "id": 1,
        "name": "Node 1",
        "address": "127.0.0.1"
      }
    }
  ]
}`
                },
                {
                  method: 'GET',
                  path: '/api/v1/servers/:id',
                  description: 'Get details for a specific server',
                  permission: 'airlink.api.servers.read',
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Minecraft Server",
    "description": "A Minecraft server",
    "owner": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com"
    },
    "node": {
      "id": 1,
      "name": "Node 1",
      "address": "127.0.0.1"
    }
  }
}`
                }
              ]
            },
            {
              category: 'Nodes',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1/nodes',
                  description: 'Get a list of all nodes',
                  permission: 'airlink.api.nodes.read',
                  responseExample: `{
  "data": [
    {
      "id": 1,
      "name": "Node 1",
      "address": "127.0.0.1",
      "port": 3001,
      "ram": 8192,
      "cpu": 4,
      "disk": 50000,
      "createdAt": "2023-01-01T00:00:00.000Z",
      "_count": {
        "servers": 2
      }
    }
  ]
}`
                },
                {
                  method: 'GET',
                  path: '/api/v1/nodes/:id',
                  description: 'Get details for a specific node',
                  permission: 'airlink.api.nodes.read',
                  responseExample: `{
  "data": {
    "id": 1,
    "name": "Node 1",
    "address": "127.0.0.1",
    "port": 3001,
    "ram": 8192,
    "cpu": 4,
    "disk": 50000,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "servers": [
      {
        "id": 1,
        "UUID": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Minecraft Server",
        "Memory": 2048,
        "Cpu": 2,
        "Storage": 10000
      }
    ]
  }
}`
                }
              ]
            },
            {
              category: 'Settings',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1/settings',
                  description: 'Get panel settings',
                  permission: 'airlink.api.settings.read',
                  responseExample: `{
  "data": {
    "id": 1,
    "title": "Airlink",
    "description": "AirLink is a free and open source project by AirlinkLabs",
    "logo": "../assets/logo.png",
    "favicon": "../assets/favicon.ico",
    "theme": "default",
    "language": "en",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}`
                },
                {
                  method: 'PATCH',
                  path: '/api/v1/settings',
                  description: 'Update panel settings',
                  permission: 'airlink.api.settings.update',
                  requestExample: `{
  "title": "My Panel",
  "description": "My custom panel",
  "logo": "/path/to/logo.png",
  "favicon": "/path/to/favicon.ico",
  "theme": "default",
  "language": "en"
}`,
                  responseExample: `{
  "data": {
    "id": 1,
    "title": "My Panel",
    "description": "My custom panel",
    "logo": "/path/to/logo.png",
    "favicon": "/path/to/favicon.ico",
    "theme": "default",
    "language": "en",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}`
                }
              ]
            }
          ];

          res.render('admin/apikeys/docs', {
            apiEndpoints,
            apiKeys,
            settings,
            user: req.session.user,
            req,
          });
        } catch (error) {
          logger.error('Error rendering API documentation:', error);
          res.status(500).render('error', {
            error: 'Failed to load API documentation',
            req
          });
        }
      }
    );


    router.get(
      '/admin/apikeys',
      isAuthenticated(true, 'airlink.admin.apikeys.view'),
      async (req: Request, res: Response) => {
        try {
          const apiKeys = await prisma.apiKey.findMany({
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          });

          const settings = await prisma.settings.findFirst();

          const allPermissions = [
            { name: 'Servers - Read', value: 'airlink.api.servers.read' },
            { name: 'Servers - Create', value: 'airlink.api.servers.create' },
            { name: 'Servers - Update', value: 'airlink.api.servers.update' },
            { name: 'Servers - Delete', value: 'airlink.api.servers.delete' },
            { name: 'Users - Read', value: 'airlink.api.users.read' },
            { name: 'Users - Create', value: 'airlink.api.users.create' },
            { name: 'Users - Update', value: 'airlink.api.users.update' },
            { name: 'Users - Delete', value: 'airlink.api.users.delete' },
            { name: 'Nodes - Read', value: 'airlink.api.nodes.read' },
            { name: 'Nodes - Create', value: 'airlink.api.nodes.create' },
            { name: 'Nodes - Update', value: 'airlink.api.nodes.update' },
            { name: 'Nodes - Delete', value: 'airlink.api.nodes.delete' },
            { name: 'Settings - Read', value: 'airlink.api.settings.read' },
            { name: 'Settings - Update', value: 'airlink.api.settings.update' },
          ];

          res.render('admin/apikeys/apikeys', {
            apiKeys,
            allPermissions,
            settings,
            user: req.session.user,
            req,
          });
        } catch (error) {
          logger.error('Error fetching API keys:', error);
          res.status(500).render('error', {
            error: 'Failed to fetch API keys',
            req,
          });
        }
      },
    );


    router.post(
      '/admin/apikeys/create',
      isAuthenticated(true, 'airlink.admin.apikeys.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, description, permissions } = req.body;

          if (!name) {
            res.status(400).json({ error: 'API key name is required' });
            return;
          }

          const key = generateApiKey(32);
          const userId = req.session.user?.id;


          const permissionsArray = permissions ?
            (Array.isArray(permissions) ? permissions : [permissions]) :
            [];

          await prisma.apiKey.create({
            data: {
              name,
              key,
              description,
              permissions: JSON.stringify(permissionsArray),
              userId,
              updatedAt: new Date(),
            },
          });

          res.redirect('/admin/apikeys');
        } catch (error) {
          logger.error('Error creating API key:', error);
          res.status(500).json({ error: 'Failed to create API key' });
        }
      },
    );


    router.post(
      '/admin/apikeys/delete/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.delete'),
      async (req: Request, res: Response) => {
        try {
          const id = parseInt(req.params.id);

          await prisma.apiKey.delete({
            where: { id },
          });

          res.redirect('/admin/apikeys');
        } catch (error) {
          logger.error('Error deleting API key:', error);
          res.status(500).json({ error: 'Failed to delete API key' });
        }
      },
    );


    router.post(
      '/admin/apikeys/toggle/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.edit'),
      async (req: Request, res: Response) => {
        try {
          const id = parseInt(req.params.id);

          const apiKey = await prisma.apiKey.findUnique({
            where: { id },
          });

          if (!apiKey) {
            res.status(404).json({ error: 'API key not found' });
            return;
          }

          await prisma.apiKey.update({
            where: { id },
            data: {
              active: !apiKey.active,
              updatedAt: new Date(),
            },
          });

          res.redirect('/admin/apikeys');
        } catch (error) {
          logger.error('Error toggling API key status:', error);
          res.status(500).json({ error: 'Failed to toggle API key status' });
        }
      },
    );


    router.post(
      '/admin/apikeys/edit/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.edit'),
      async (req: Request, res: Response) => {
        try {
          const id = parseInt(req.params.id);
          const { name, description, permissions } = req.body;

          if (!name) {
            res.status(400).json({ error: 'API key name is required' });
            return;
          }


          const permissionsArray = permissions ?
            (Array.isArray(permissions) ? permissions : [permissions]) :
            [];

          await prisma.apiKey.update({
            where: { id },
            data: {
              name,
              description,
              permissions: JSON.stringify(permissionsArray),
              updatedAt: new Date(),
            },
          });

          res.redirect('/admin/apikeys');
        } catch (error) {
          logger.error('Error updating API key:', error);
          res.status(500).json({ error: 'Failed to update API key' });
        }
      },
    );

    return router;
  },
};

export default coreModule;
