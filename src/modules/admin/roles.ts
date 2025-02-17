import { Router, Request, Response, NextFunction } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const rolesModule: Module = {
	info: {
		name: 'Roles Module',
		description: 'Handles role management',
		version: '1.0.0',
		moduleVersion: '1.0.0',
		author: 'AirLinkLab',
		license: 'MIT',
	},
	router: () => {
		const router = Router();

		// Delete role route
		router.delete(
			'/admin/roles/delete/:id',
			isAuthenticated(true),
			async (req: Request, res: Response, next: NextFunction): Promise<void> => {
				try {
					const roleId = parseInt(req.params.id, 10);
					const role = await prisma.role.findUnique({ where: { id: roleId } });

					if (!role) {
						res.status(404).json({ message: 'Role not found' });
						return;
					}

					// Delete role permissions first
					await prisma.rolePermission.deleteMany({
						where: { roleId }
					});

					// Delete the role
					await prisma.role.delete({
						where: { id: roleId }
					});

					res.status(200).json({ message: 'Role deleted successfully' });
				} catch (error) {
					logger.error('Error deleting role:', error);
					res.status(500).json({ message: 'Error deleting role' });
				}
			}
		);

		return router;
	},
};

export default rolesModule;