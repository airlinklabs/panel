# AirLink Panel Addon Quick Start Guide

This guide will help you quickly create your first addon for AirLink Panel.

## Prerequisites

- AirLink Panel installed and running
- Basic knowledge of JavaScript/TypeScript
- Familiarity with Express.js

## Step 1: Create the Addon Directory

Create a new directory in the `panel/storage/addons/` folder with your addon's slug:

```bash
mkdir -p panel/storage/addons/my-first-addon/views
```

## Step 2: Create package.json

Create a `package.json` file in your addon directory:

```json
{
  "name": "My First Addon",
  "version": "1.0.0",
  "description": "My first AirLink Panel addon",
  "author": "Your Name",
  "main": "index.ts",
  "router": "/my-first-addon"
}
```

## Step 3: Create the Entry Point

Create an `index.ts` file in your addon directory:

```typescript
import { Router } from 'express';
import path from 'path';

export default function(router: Router, api: any) {
  const { logger, prisma } = api;

  logger.info('My First Addon initialized');

  // Add a route
  router.get('/', async (req: any, res: any) => {
    try {
      const userCount = await prisma.users.count();
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

      res.render(path.join(api.viewsPath, 'index.ejs'), {
        user: req.session?.user,
        req,
        userCount,
        settings,
        components: {
          header: api.getComponentPath('views/components/header'),
          template: api.getComponentPath('views/components/template'),
          footer: api.getComponentPath('views/components/footer')
        }
      });
    } catch (error) {
      logger.error('Error in my first addon:', error);
      res.status(500).send('An error occurred');
    }
  });

  // Add an API route
  router.get('/api/hello', (req, res) => {
    res.json({
      success: true,
      message: 'Hello from My First Addon!',
      timestamp: new Date().toISOString()
    });
  });
}
```

## Step 4: Create a View

Create a view file at `views/index.ejs`:

```html
<%- include(components.header, { title: 'My First Addon', user: user }) %>

<main class="h-screen m-auto">
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-60 h-full">
      <%- include(components.template) %>
    </div>
    <!-- Content -->
    <div class="flex-1 p-6 overflow-y-auto pt-16">
      <div class="sm:flex sm:items-center px-8 pt-4">
        <div class="sm:flex-auto">
          <h1 class="text-base font-medium leading-6 text-white">My First Addon</h1>
          <p class="mt-1 tracking-tight text-sm text-neutral-500">Welcome to my first AirLink Panel addon!</p>
        </div>
      </div>
      <div class="px-8 mt-5">
        <div class="rounded-xl bg-neutral-900 p-6">
          <h2 class="text-lg font-medium text-white mb-4">User Count</h2>
          <p class="text-3xl font-bold text-white"><%= userCount %></p>
          <p class="text-sm text-neutral-400 mt-1">Total registered users</p>
          
          <div class="mt-6">
            <h3 class="text-lg font-medium text-white mb-4">API Example</h3>
            <p class="text-sm text-neutral-400 mb-2">This addon provides an API endpoint at <code>/my-first-addon/api/hello</code></p>
            <button id="fetchApiBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200">
              Fetch API Data
            </button>
            <pre id="apiResult" class="mt-4 bg-neutral-800 p-4 rounded-lg text-neutral-300 text-sm hidden"></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>

<script>
  document.getElementById('fetchApiBtn').addEventListener('click', async () => {
    try {
      const response = await fetch('/my-first-addon/api/hello');
      const data = await response.json();

      const resultElement = document.getElementById('apiResult');
      resultElement.textContent = JSON.stringify(data, null, 2);
      resultElement.classList.remove('hidden');
    } catch (error) {
      console.error('Error fetching API data:', error);
      alert('Failed to fetch API data');
    }
  });
</script>

<%- include(components.footer) %>
```

## Step 5: Enable Your Addon

1. Restart the AirLink Panel server
2. Go to the admin panel at `/admin/addons`
3. Your addon should appear in the list
4. Make sure it's enabled
5. Visit your addon at `/my-first-addon`

## Next Steps

Now that you have a basic addon working, you can:

1. Add database migrations to create custom tables
2. Add UI components to the sidebar or server menu
3. Create more complex features using the Addon API
4. Style your addon using Tailwind CSS (already included in the panel)

## Learn More

For more detailed information, check out these resources:

- [Complete Addon Documentation](addons.md)
- [Database Migrations Guide](addon-migrations.md)
- [Example Addons](../storage/addons/test-addon)

## Troubleshooting

If your addon doesn't appear in the admin panel:

1. Check the server logs for errors
2. Make sure your `package.json` is valid JSON
3. Verify that your entry point file exists and exports a function
4. Restart the panel server

If you see errors when accessing your addon:

1. Check the server logs for detailed error messages
2. Verify that your routes are defined correctly
3. Make sure your view files exist and have the correct paths
