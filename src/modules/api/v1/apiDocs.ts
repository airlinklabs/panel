export const apiEndpoints = [
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
