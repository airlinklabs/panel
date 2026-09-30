import { Router } from 'express';
import { isAuthenticated } from '../../../handlers/utils/auth/authUtil';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '../../../handlers/internalApiClient';
import type { Module } from '../../../handlers/moduleInit';

const ALL_PERMISSIONS = [
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
  { name: 'Images - Read', value: 'airlink.api.images.read' },
  { name: 'Images - Create', value: 'airlink.api.images.create' },
  { name: 'Images - Update', value: 'airlink.api.images.update' },
  { name: 'Images - Delete', value: 'airlink.api.images.delete' },
  { name: 'Locations - Read', value: 'airlink.api.locations.read' },
  { name: 'Locations - Create', value: 'airlink.api.locations.create' },
];

const API_ENDPOINTS = [
  {
    category: 'Servers',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/servers',
        permission: 'airlink.api.servers.read',
        description: 'List all servers accessible to the authenticated user.',
        requestExample: null,
        responseExample:
          '{\n  "data": [\n    {\n      "id": 1,\n      "name": "My Server",\n      "UUID": "abc-123",\n      "Running": true\n    }\n  ]\n}',
      },
      {
        method: 'POST',
        path: '/api/v2/servers',
        permission: 'airlink.api.servers.create',
        description: 'Create a new server.',
        requestExample:
          '{\n  "name": "New Server",\n  "imageId": 1,\n  "nodeId": 1,\n  "memory": 2048,\n  "cpu": 100,\n  "disk": 10240\n}',
        responseExample:
          '{\n  "data": {\n    "id": 2,\n    "name": "New Server",\n    "UUID": "def-456"\n  }\n}',
      },
      {
        method: 'GET',
        path: '/api/v2/servers/:id',
        permission: 'airlink.api.servers.read',
        description: 'Get details of a specific server.',
        requestExample: null,
        responseExample:
          '{\n  "data": {\n    "id": 1,\n    "name": "My Server",\n    "UUID": "abc-123",\n    "Running": true\n  }\n}',
      },
      {
        method: 'PUT',
        path: '/api/v2/servers/:id',
        permission: 'airlink.api.servers.update',
        description: 'Update a server\'s configuration.',
        requestExample: '{\n  "name": "Renamed Server"\n}',
        responseExample:
          '{\n  "data": {\n    "id": 1,\n    "name": "Renamed Server"\n  }\n}',
      },
      {
        method: 'DELETE',
        path: '/api/v2/servers/:id',
        permission: 'airlink.api.servers.delete',
        description: 'Delete a server permanently.',
        requestExample: null,
        responseExample: '{\n  "data": {\n    "deleted": 1\n  }\n}',
      },
    ],
  },
  {
    category: 'Users',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/admin/users',
        permission: 'airlink.api.users.read',
        description: 'List all users (admin only).',
        requestExample: null,
        responseExample:
          '{\n  "data": [\n    {\n      "id": 1,\n      "username": "admin",\n      "email": "admin@example.com",\n      "isAdmin": true\n    }\n  ]\n}',
      },
      {
        method: 'POST',
        path: '/api/v2/admin/users',
        permission: 'airlink.api.users.create',
        description: 'Create a new user (admin only).',
        requestExample:
          '{\n  "email": "user@example.com",\n  "username": "newuser",\n  "password": "securepass123"\n}',
        responseExample:
          '{\n  "data": {\n    "id": 2,\n    "email": "user@example.com",\n    "username": "newuser"\n  }\n}',
      },
      {
        method: 'GET',
        path: '/api/v2/admin/users/:id',
        permission: 'airlink.api.users.read',
        description: 'Get details of a specific user (admin only).',
        requestExample: null,
        responseExample:
          '{\n  "data": {\n    "id": 1,\n    "username": "admin",\n    "email": "admin@example.com"\n  }\n}',
      },
      {
        method: 'PUT',
        path: '/api/v2/admin/users/:id',
        permission: 'airlink.api.users.update',
        description: 'Update a user (admin only).',
        requestExample: '{\n  "username": "updatedname"\n}',
        responseExample:
          '{\n  "data": {\n    "id": 1,\n    "username": "updatedname"\n  }\n}',
      },
      {
        method: 'DELETE',
        path: '/api/v2/admin/users/:id',
        permission: 'airlink.api.users.delete',
        description: 'Delete a user (admin only).',
        requestExample: null,
        responseExample: '{\n  "data": {\n    "deleted": 1\n  }\n}',
      },
    ],
  },
  {
    category: 'Nodes',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/admin/nodes',
        permission: 'airlink.api.nodes.read',
        description: 'List all nodes (admin only).',
        requestExample: null,
        responseExample:
          '{\n  "data": [\n    {\n      "id": 1,\n      "name": "Node 1",\n      "status": "online"\n    }\n  ]\n}',
      },
      {
        method: 'POST',
        path: '/api/v2/admin/nodes',
        permission: 'airlink.api.nodes.create',
        description: 'Create a new node (admin only).',
        requestExample: '{\n  "name": "New Node",\n  "locationId": 1\n}',
        responseExample:
          '{\n  "data": {\n    "id": 2,\n    "name": "New Node"\n  }\n}',
      },
      {
        method: 'PUT',
        path: '/api/v2/admin/nodes/:id',
        permission: 'airlink.api.nodes.update',
        description: 'Update a node (admin only).',
        requestExample: '{\n  "name": "Updated Node"\n}',
        responseExample:
          '{\n  "data": {\n    "id": 1,\n    "name": "Updated Node"\n  }\n}',
      },
      {
        method: 'DELETE',
        path: '/api/v2/admin/nodes/:id',
        permission: 'airlink.api.nodes.delete',
        description: 'Delete a node (admin only).',
        requestExample: null,
        responseExample: '{\n  "data": {\n    "deleted": 1\n  }\n}',
      },
    ],
  },
  {
    category: 'Settings',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/admin/settings',
        permission: 'airlink.api.settings.read',
        description: 'Get panel settings (admin only).',
        requestExample: null,
        responseExample:
          '{\n  "data": {\n    "title": "My Panel",\n    "theme": "dark"\n  }\n}',
      },
      {
        method: 'PUT',
        path: '/api/v2/admin/settings',
        permission: 'airlink.api.settings.update',
        description: 'Update panel settings (admin only).',
        requestExample: '{\n  "title": "Updated Panel"\n}',
        responseExample: '{\n  "data": {\n    "title": "Updated Panel"\n  }\n}',
      },
    ],
  },
];

const module: Module = {
  info: {
    name: 'Admin API Keys Page',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
    description: '',
  },
  router: () => {
    const router = Router();

    router.get(
      '/admin/api/docs',
      isAuthenticated(true, 'airlink.admin.api.docs.view'),
      async (req, res, next) => {
        try {
          const result = (await apiGet(req, '/api/v2/admin/apikeys')) as {
            id: number;
            name: string;
            key: string;
            active: boolean;
            permissions: string[];
          }[];
          const apiKeys = (result || []).map((k) => ({
            ...k,
            permissions: Array.isArray(k.permissions)
              ? JSON.stringify(k.permissions)
              : '[]',
          }));
          res.render('admin/apikeys/docs', {
            apiKeys,
            allPermissions: ALL_PERMISSIONS,
            apiEndpoints: API_ENDPOINTS,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.get(
      '/admin/apikeys',
      isAuthenticated(true, 'airlink.admin.apikeys.view'),
      async (req, res, next) => {
        try {
          const result = (await apiGet(req, '/api/v2/admin/apikeys')) as {
            data?: {
              id: number;
              name: string;
              description?: string;
              permissions: string[];
              active: boolean;
              key?: string;
              createdAt: string;
            }[];
          };
          const apiKeys = result || [];
          const created =
            typeof req.query.created === 'string' ? req.query.created : null;
          res.render('admin/apikeys/index', {
            apiKeys,
            allPermissions: ALL_PERMISSIONS,
            created,
            user: req.session?.user,
            req,
          });
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/apikeys/create',
      isAuthenticated(true, 'airlink.admin.apikeys.create'),
      async (req, res, next) => {
        try {
          const result = (await apiPost(
            req,
            '/api/v2/admin/apikeys',
            req.body,
          )) as { key?: string };
          const rawKey = result?.key;
          if (rawKey) {
            res.redirect(
              `/admin/apikeys?created=${encodeURIComponent(rawKey)}`,
            );
          } else {
            res.redirect('/admin/apikeys');
          }
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/apikeys/delete/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.delete'),
      async (req, res, next) => {
        try {
          await apiDelete(req, `/api/v2/admin/apikeys/${req.params.id}`);
          res.redirect('/admin/apikeys');
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/apikeys/edit/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.edit'),
      async (req, res, next) => {
        try {
          await apiPut(req, `/api/v2/admin/apikeys/${req.params.id}`, req.body);
          res.redirect('/admin/apikeys');
        } catch (err) {
          next(err);
        }
      },
    );

    router.post(
      '/admin/apikeys/toggle/:id',
      isAuthenticated(true, 'airlink.admin.apikeys.edit'),
      async (req, res, next) => {
        try {
          await apiPost(
            req,
            `/api/v2/admin/apikeys/${req.params.id}/toggle`,
            req.body,
          );
          res.redirect('/admin/apikeys');
        } catch (err) {
          next(err);
        }
      },
    );

    return router;
  },
};

export default module;
