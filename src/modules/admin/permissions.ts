import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';


// Define available permissions
export const AVAILABLE_PERMISSIONS = {
	// Admin permissions
	ADMIN_ACCESS: 'admin.access',
	ADMIN_SETTINGS: 'admin.settings',
	ADMIN_USERS: 'admin.users',
	ADMIN_SERVERS: 'admin.servers',
	ADMIN_NODES: 'admin.nodes',
	ADMIN_LOCATIONS: 'admin.locations',
	ADMIN_IMAGES: 'admin.images',
	
	// User permissions
	USER_CREATE_SERVER: 'user.create-server',
	USER_DELETE_SERVER: 'user.delete-server',
	USER_MODIFY_SERVER: 'user.modify-server',
	USER_VIEW_SERVERS: 'user.view-servers',
	USER_ACCESS_SFTP: 'user.access-sftp',
	USER_ACCESS_CONSOLE: 'user.access-console',
	USER_VIEW_STARTUP: 'user.view-startup',
	USER_EDIT_STARTUP: 'user.edit-startup',
} as const;

const permissionsModule: Module = {
	info: {
		name: 'Permissions Module',
		description: 'Handles permissions management',
		version: '1.0.0',
		moduleVersion: '1.0.0',
		author: 'AirLinkLab',
		license: 'MIT',
	},

	router: () => {
		const router = Router();

		// Get available permissions
		router.get('/admin/permissions', async (req: Request, res: Response): Promise<void> => {
			res.json(AVAILABLE_PERMISSIONS);
		});

		return router;
	},

};

export default permissionsModule;