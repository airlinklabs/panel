import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

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
		description: 'Handles role and permission management',
		version: '1.0.0',
		moduleVersion: '1.0.0',
		author: 'AirLinkLab',
		license: 'MIT',
	},

	router: () => {
		const router = Router();

		const isAdmin = (): RequestHandler => {
			return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
				if (!req.session?.user?.isAdmin) {
					res.status(403).json({ error: 'Unauthorized access' });
					return;
				}
				next();
			};
		};

		// Get all roles
		router.get('/admin/roles', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			try {
				const roles = await prisma.role.findMany({
					include: {
						permissions: true
					}
				});
				res.render('admin/roles/roles', { 
					roles,
					user: req.session.user,
					settings: req.app.locals.settings
				});
			} catch (error) {
				logger.error('Error fetching roles:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Create new role
		router.post('/admin/roles', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			const { name, description, permissions } = req.body;

			try {
				const role = await prisma.role.create({
					data: {
						name,
						description,
						permissions: {
							create: permissions.map((permission: string) => ({
								permission
							}))
						}
					},
					include: {
						permissions: true
					}
				});
				res.status(201).json(role);
			} catch (error) {
				logger.error('Error creating role:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Update role
		router.patch('/admin/roles/:id', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			const { id } = req.params;
			const { name, description, permissions } = req.body;

			try {
				// Delete existing permissions
				await prisma.rolePermission.deleteMany({
					where: { roleId: parseInt(id) }
				});

				// Update role and add new permissions
				const role = await prisma.role.update({
					where: { id: parseInt(id) },
					data: {
						name,
						description,
						permissions: {
							create: permissions.map((permission: string) => ({
								permission
							}))
						}
					},
					include: {
						permissions: true
					}
				});
				res.json(role);
			} catch (error) {
				logger.error('Error updating role:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Delete role
		router.delete('/admin/roles/:id', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			const { id } = req.params;

			try {
				await prisma.role.delete({
					where: { id: parseInt(id) }
				});
				res.status(204).send();
			} catch (error) {
				logger.error('Error deleting role:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Assign role to user
		router.post('/admin/users/:userId/role', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			const { userId } = req.params;
			const { roleId } = req.body;

			try {
				const userRole = await prisma.userRole.create({
					data: {
						userId: parseInt(userId),
						roleId: parseInt(roleId)
					}
				});
				res.status(201).json(userRole);
			} catch (error) {
				logger.error('Error assigning role:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Get available permissions
		router.get('/admin/permissions', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			res.json(AVAILABLE_PERMISSIONS);
		});

		// Render create role page
		router.get('/admin/roles/create', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			try {
				res.render('admin/roles/create', {
					user: req.session.user,
					settings: req.app.locals.settings,
					AVAILABLE_PERMISSIONS
				});
			} catch (error) {
				logger.error('Error rendering create role page:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Handle the create role POST request
		router.post('/admin/roles/create', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			const { name, description, permissions } = req.body;

			try {
				const role = await prisma.role.create({
					data: {
						name,
						description,
						permissions: {
							create: permissions.map((permission: string) => ({
								permission
							}))
						}
					},
					include: {
						permissions: true
					}
				});
				res.redirect('/admin/roles'); // Redirect to the roles list after successful creation
			} catch (error) {
				logger.error('Error creating role:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Render edit role page
		router.get('/admin/roles/edit/:id', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			try {
				const role = await prisma.role.findUnique({
					where: { id: parseInt(req.params.id) },
					include: { permissions: true }
				});
				
				if (!role) {
					res.status(404).json({ error: 'Role not found' });
					return;
				}

				res.render('admin/roles/edit', {
					role,
					user: req.session.user,
					settings: req.app.locals.settings,
					AVAILABLE_PERMISSIONS
				});
			} catch (error) {
				logger.error('Error rendering edit role page:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		// Render view role page
		router.get('/admin/roles/view/:id', isAdmin() as RequestHandler, async (req: Request, res: Response): Promise<void> => {
			try {
				const role = await prisma.role.findUnique({
					where: { id: parseInt(req.params.id) },
					include: { permissions: true }
				});
				
				if (!role) {
					res.status(404).json({ error: 'Role not found' });
					return;
				}

				res.render('admin/roles/view', {
					role,
					user: req.session.user,
					settings: req.app.locals.settings
				});
			} catch (error) {
				logger.error('Error rendering view role page:', error);
				res.status(500).json({ error: 'Internal server error' });
			}
		});

		return router;
	},
};

export default permissionsModule;