import { Module } from '../../handlers/moduleInit';
import { uiComponentStore } from '../../handlers/uiComponentHandler';
import { Router } from 'express';

const locationsUIModule: Module = {
  info: {
    name: 'Admin Locations UI Module',
    description: 'This file registers UI components for the locations feature in the admin panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    // Add the locations menu item to the admin sidebar
    uiComponentStore.addSidebarItem({
      id: 'admin-locations',
      label: 'Locations',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mt-0.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>',
      url: '/admin/locations',
      priority: 85, // Position it between Player Statistics (95) and other admin items
      isAdminItem: true
    });

    // Return an empty router since this module only registers UI components
    return Router();
  },
};

export default locationsUIModule;
