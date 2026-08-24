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
  },
  {
    category: 'Server Backups',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/servers/:id/backups',
        description: 'List backups for a server (by UUID)',
        permission: 'airlink.api.servers.read',
        responseExample: `{
  "data": [
    {
      "UUID": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Pre-update backup",
      "size": "123456",
      "checksum": null,
      "locked": false,
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/backups',
        description: 'Create a backup for a server (by UUID)',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "name": "Pre-update backup"
}`,
        responseExample: `{
  "data": {
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Pre-update backup",
    "size": "123456",
    "locked": false,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/backups/:backupId/restore',
        description: 'Restore a backup (by server UUID + backup UUID)',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/servers/:id/backups/:backupId',
        description: 'Delete a backup. Fails if the backup is locked.',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Server Databases',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/servers/:id/databases',
        description: 'List databases for a server (by UUID)',
        permission: 'airlink.api.servers.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "serverId": "550e8400-e29b-41d4-a716-446655440000",
      "hostId": 1,
      "databaseName": "srv_db",
      "databaseUser": "srv_user",
      "host": { "id": 1, "name": "MySQL 1" }
    }
  ]
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/databases',
        description: 'Provision a database for a server. Respects server + owner database limits.',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "hostId": 1
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "serverId": "550e8400-e29b-41d4-a716-446655440000",
    "databaseName": "srv_db",
    "databaseUser": "srv_user"
  }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/servers/:id/databases/:dbId',
        description: 'Deprovision and delete a database',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Server Subusers',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/servers/:id/subusers',
        description: 'List subusers for a server (by UUID)',
        permission: 'airlink.api.servers.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "user": { "id": 2, "username": "admin", "email": "admin@example.com" },
      "permissions": ["console", "files.read"],
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/subusers',
        description: 'Add a user (by email) as a subuser',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "email": "admin@example.com",
  "permissions": ["console", "files"]
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "user": { "id": 2, "username": "admin", "email": "admin@example.com" },
    "permissions": ["console", "files"]
  }
}`
      },
      {
        method: 'PATCH',
        path: '/api/v1/servers/:id/subusers/:subUserId',
        description: 'Update a subuser\u2019s permissions',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "permissions": ["console", "files.read"]
}`,
        responseExample: `{
  "data": { "success": true, "permissions": ["console", "files.read"] }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/servers/:id/subusers/:subUserId',
        description: 'Remove a subuser',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Server Startup',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/servers/:id/startup',
        description: 'Get startup command, Docker image, and variables',
        permission: 'airlink.api.servers.read',
        responseExample: `{
  "data": {
    "startCommand": "java -jar server.jar",
    "dockerImage": "ghcr.io/pterodactyl/yolks:java_17",
    "variables": [
      { "name": "Memory", "env": "SERVER_MEMORY", "value": "1024" }
    ]
  }
}`
      },
      {
        method: 'PATCH',
        path: '/api/v1/servers/:id/startup',
        description: 'Update startup command, Docker image, or variables. Variables are validated against stored rules.',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "startCommand": "java -Xms1G -jar server.jar",
  "dockerImage": "ghcr.io/parkernoad:java_17",
  "variables": [{ "env": "SERVER_MEMORY", "value": "2048" }]
}`,
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Server Schedules',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/servers/:id/schedules',
        description: 'List schedules (with tasks) for a server',
        permission: 'airlink.api.servers.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "name": "Nightly backup",
      "cron": "0 0 * * *",
      "enabled": false,
      "nextRunAt": null,
      "tasks": []
    }
  ]
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/schedules',
        description: 'Create a schedule',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "name": "Nightly backup",
  "cron": "0 0 * * *",
  "timeOffset": 0
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "serverId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Nightly backup",
    "cron": "0 0 * * *",
    "enabled": false
  }
}`
      },
      {
        method: 'PATCH',
        path: '/api/v1/servers/:id/schedules/:scheduleId',
        description: 'Enable/disable a schedule or update its time offset',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "enabled": true
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "enabled": true,
    "timeOffset": 0
  }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/servers/:id/schedules/:scheduleId',
        description: 'Delete a schedule',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      },
      {
        method: 'POST',
        path: '/api/v1/servers/:id/schedules/:scheduleId/tasks',
        description: 'Add a task (command | power | backup) to a schedule',
        permission: 'airlink.api.servers.update',
        requestExample: `{
  "action": "command",
  "payload": { "command": "say hello" },
  "timeOffset": 0
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "scheduleId": 1,
    "order": 0,
    "action": "command",
    "payload": { "command": "say hello" }
  }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId',
        description: 'Delete a task from a schedule',
        permission: 'airlink.api.servers.update',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Node Allocations',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/nodes/:id/allocations',
        description: 'List allocations for a node, including claimed servers',
        permission: 'airlink.api.nodes.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "nodeId": 1,
      "ip": "",
      "port": 25565,
      "serverId": null
    }
  ]
}`
      },
      {
        method: 'POST',
        path: '/api/v1/nodes/:id/allocations',
        description: 'Add a port to the node\u2019s allocation pool',
        permission: 'airlink.api.nodes.update',
        requestExample: `{
  "ip": "",
  "port": 25566
}`,
        responseExample: `{
  "data": {
    "id": 2,
    "nodeId": 1,
    "ip": "",
    "port": 25566,
    "serverId": null
  }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/nodes/:id/allocations/:allocationId',
        description: 'Delete an allocation. Fails if it is currently in use.',
        permission: 'airlink.api.nodes.update',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Images',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/images',
        description: 'Get a paginated list of egg images. Query params: page, per_page.',
        permission: 'airlink.api.images.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "UUID": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Java",
      "description": "Generic Java egg",
      "startup": "java -jar server.jar",
      "stop": "stop",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "per_page": 25, "current_page": 1, "last_page": 1 }
}`
      },
      {
        method: 'POST',
        path: '/api/v1/images',
        description: 'Create a new egg image',
        permission: 'airlink.api.images.create',
        requestExample: `{
  "name": "Java",
  "description": "Generic Java egg",
  "startup": "java -jar server.jar"
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "UUID": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Java",
    "startup": "java -jar server.jar"
  }
}`
      },
      {
        method: 'GET',
        path: '/api/v1/images/:id',
        description: 'Get a single image with all egg data',
        permission: 'airlink.api.images.read',
        responseExample: `{
  "data": {
    "id": 1,
    "name": "Java",
    "dockerImages": "[]",
    "variables": "[]",
    "scripts": "{}",
    "info": "{\\"features\\":[]}"
  }
}`
      },
      {
        method: 'PATCH',
        path: '/api/v1/images/:id',
        description: 'Update an image. Array fields (dockerImages, variables, info, scripts) are sent as raw JSON.',
        permission: 'airlink.api.images.update',
        requestExample: `{
  "name": "Java 17",
  "dockerImages": [{ "Java 17": "ghcr.io/pterodactyl/yolks:java_17" }]
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "name": "Java 17",
    "startup": "java -jar server.jar"
  }
}`
      },
      {
        method: 'DELETE',
        path: '/api/v1/images/:id',
        description: 'Delete an image. Fails if it is used by servers.',
        permission: 'airlink.api.images.delete',
        responseExample: `{
  "data": { "success": true }
}`
      }
    ]
  },
  {
    category: 'Locations',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/locations',
        description: 'Get a paginated list of locations. Query params: page, per_page.',
        permission: 'airlink.api.locations.read',
        responseExample: `{
  "data": [
    {
      "id": 1,
      "name": "US East",
      "shortCode": "us_east",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "_count": { "nodes": 2 }
    }
  ],
  "meta": { "total": 1, "per_page": 25, "current_page": 1, "last_page": 1 }
}`
      },
      {
        method: 'POST',
        path: '/api/v1/locations',
        description: 'Create a location',
        permission: 'airlink.api.locations.create',
        requestExample: `{
  "name": "US East",
  "shortCode": "us-east"
}`,
        responseExample: `{
  "data": {
    "id": 1,
    "name": "US East",
    "shortCode": "us-east",
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}`
      }
    ]
  }
];
