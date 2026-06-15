import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permissions';
import { getParamAsNumber } from '../../utils/typeHelpers';
import crypto from 'crypto';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function shouldHashKeys(): Promise<boolean> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    return s?.hashApiKeys === true;
  } catch {
    return false;
  }
}

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
              category: 'Introspection',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1',
                  description: 'List all available API routes',
                  permission: 'None (public)',
                  responseExample: `{
  "data": {
    "version": "v1",
    "endpoints": [
      { "method": "GET", "path": "/api/v1/users", "description": "List users", "permission": "airlink.api.users.read" }
    ]
  }
}`
                }
              ]
            },
            {
              category: 'Users',
              endpoints: [
                {
                  method: 'GET',
                  path: '/api/v1/users',
                  description: 'Get a paginated list of users. Query params: page, per_page.',
                  permission: 'airlink.api.users.read',
                  responseExample: `{
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "isAdmin": true,
      "description": "Administrator account"
    }
  ],
  "meta": { "total": 1, "per_page": 25, "current_page": 1, "last_page": 1 }
}`
                },
                {
                  method: 'POST',
                  path: '/api/v1/users',
                  description: 'Create a new user. Password is hashed with bcrypt.',
                  permission: 'airlink.api.users.create',
                  requestExample: `{
  "email": "newuser@example.com",
  "username": "newuser",
  "password": "securepassword",
  "isAdmin": false,
  "description": "Optional description"
}`,
                  responseExample: `{
  "data": {
    "id": 2,
    "username": "newuser",
    "email": "newuser@example.com",
    "isAdmin": false,
    "description": "Optional description"
  }
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
    "description": "Administrator account"
  }
}`
                },
                {
                  method: 'PATCH',
                  path: '/api/v1/users/:id',
                  description: 'Update an existing user. Only send fields to change.',
                  permission: 'airlink.api.users.update',
                  requestExample: `{
  "email": "updated@example.com",
  "username": "updatedname"
}`,
                  responseExample: `{
  "data": {
    "id": 1,
    "username": "updatedname",
    "email": "updated@example.com",
    "isAdmin": true,
    "description": "Administrator account"
  }
}`
                },
                {
                  method: 'DELETE',
                  path: '/api/v1/users/:id',
                  description: 'Delete a user by ID',
                  permission: 'airlink.api.users.delete',
                  responseExample: `{
  "data": { "success": true }
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
                  description: 'Get a paginated list of servers. Query params: page, per_page.',
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
  ],
  "meta": { "total": 1, "per_page": 25, "current_page": 1, "last_page": 1 }
}`
                },
                {
                  method: 'POST',
                  path: '/api/v1/servers',
                  description: 'Create a new server. UUID is auto-generated.',
                  permission: 'airlink.api.servers.create',
                  requestExample: `{
  "name": "My Server",
  "description": "Optional description",
  "ownerId": 1,
  "nodeId": 1,
  "imageId": 1,
  "Memory": 2048,
  "Cpu": 100,
  "Storage": 10240
}`,
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Server",
    "owner": { "id": 1, "username": "admin", "email": "admin@example.com" },
    "node": { "id": 1, "name": "Node 1", "address": "127.0.0.1" }
  }
}`
                },
                {
                  method: 'GET',
                  path: '/api/v1/servers/:id',
                  description: 'Get details for a specific server (by UUID)',
                  permission: 'airlink.api.servers.read',
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Minecraft Server",
    "owner": { "id": 1, "username": "admin", "email": "admin@example.com" },
    "node": { "id": 1, "name": "Node 1", "address": "127.0.0.1" }
  }
}`
                },
                {
                  method: 'PATCH',
                  path: '/api/v1/servers/:id',
                  description: 'Update an existing server (by UUID). Only send fields to change.',
                  permission: 'airlink.api.servers.update',
                  requestExample: `{
  "name": "Updated Server Name",
  "Memory": 4096
}`,
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Updated Server Name",
    "Memory": 4096
  }
}`
                },
                {
                  method: 'POST',
                  path: '/api/v1/servers/:id/suspend',
                  description: 'Suspend a server (by UUID)',
                  permission: 'airlink.api.servers.update',
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "Suspended": true
  }
}`
                },
                {
                  method: 'POST',
                  path: '/api/v1/servers/:id/unsuspend',
                  description: 'Unsuspend a server (by UUID)',
                  permission: 'airlink.api.servers.update',
                  responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "Suspended": false
  }
}`
                },
                {
                  method: 'DELETE',
                  path: '/api/v1/servers/:id',
                  description: 'Delete a server (by UUID)',
                  permission: 'airlink.api.servers.delete',
                  responseExample: `{
  "data": { "success": true }
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
                  description: 'Get a paginated list of nodes. Query params: page, per_page.',
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
      "_count": { "servers": 2 }
    }
  ],
  "meta": { "total": 1, "per_page": 25, "current_page": 1, "last_page": 1 }
}`
                },
                {
                  method: 'POST',
                  path: '/api/v1/nodes',
                  description: 'Create a new node',
                  permission: 'airlink.api.nodes.create',
                  requestExample: `{
  "name": "Node 2",
  "address": "192.168.1.100",
  "port": 3001,
  "ram": 16384,
  "cpu": 8,
  "disk": 100000,
  "key": "your-node-key"
}`,
                  responseExample: `{
  "data": {
    "id": 2,
    "name": "Node 2",
    "address": "192.168.1.100",
    "port": 3001,
    "ram": 16384,
    "cpu": 8,
    "disk": 100000,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
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
        "Cpu": 100,
        "Storage": 20480
      }
    ]
  }
}`
                },
                {
                  method: 'PATCH',
                  path: '/api/v1/nodes/:id',
                  description: 'Update an existing node. Only send fields to change.',
                  permission: 'airlink.api.nodes.update',
                  requestExample: `{
  "name": "Updated Node",
  "ram": 32768
}`,
                  responseExample: `{
  "data": {
    "id": 1,
    "name": "Updated Node",
    "address": "127.0.0.1",
    "port": 3001,
    "ram": 32768,
    "cpu": 4,
    "disk": 50000,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}`
                },
                {
                  method: 'DELETE',
                  path: '/api/v1/nodes/:id',
                  description: 'Delete a node. Fails if servers are assigned.',
                  permission: 'airlink.api.nodes.delete',
                  responseExample: `{
  "data": { "success": true }
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

          const rawKey = generateApiKey(32);
          const userId = req.session.user?.id;
          const useHash = await shouldHashKeys();
          const storedKey = useHash ? sha256(rawKey) : rawKey;

          const permissionsArray = permissions ?
            (Array.isArray(permissions) ? permissions : [permissions]) :
            [];

          await prisma.apiKey.create({
            data: {
              name,
              key: storedKey,
              description,
              permissions: JSON.stringify(permissionsArray),
              userId,
              updatedAt: new Date(),
            },
          });

          if (useHash) {
            res.redirect(`/admin/apikeys?created=${encodeURIComponent(rawKey)}`);
          } else {
            res.redirect('/admin/apikeys');
          }
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
          const id = getParamAsNumber(req.params.id);

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
          const id = getParamAsNumber(req.params.id);

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
          const id = getParamAsNumber(req.params.id);
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
