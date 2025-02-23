import { PrismaClient } from '@prisma/client';
import { AVAILABLE_PERMISSIONS } from '../modules/admin/permissions';

const prisma = new PrismaClient();

async function setupDefaultRoles() {
	try {
		// Create default roles
		const roles = [
			{
				name: 'Administrator',
				description: 'Full access to all features',
				permissions: Object.values(AVAILABLE_PERMISSIONS)
			},
			{
				name: 'Server Manager',
				description: 'Can manage servers and view server resources',
				permissions: [
					AVAILABLE_PERMISSIONS.USER_CREATE_SERVER,
					AVAILABLE_PERMISSIONS.USER_DELETE_SERVER,
					AVAILABLE_PERMISSIONS.USER_MODIFY_SERVER,
					AVAILABLE_PERMISSIONS.USER_VIEW_SERVERS,
					AVAILABLE_PERMISSIONS.USER_ACCESS_SFTP,
					AVAILABLE_PERMISSIONS.USER_ACCESS_CONSOLE,
					AVAILABLE_PERMISSIONS.USER_VIEW_STARTUP,
					AVAILABLE_PERMISSIONS.USER_EDIT_STARTUP
				]
			},
			{
				name: 'User',
				description: 'Basic user access',
				permissions: [
					AVAILABLE_PERMISSIONS.USER_VIEW_SERVERS,
					AVAILABLE_PERMISSIONS.USER_ACCESS_CONSOLE,
					AVAILABLE_PERMISSIONS.USER_VIEW_STARTUP
				]
			}
		];

		// Create roles and their permissions
		for (const roleData of roles) {
			const role = await prisma.role.create({
				data: {
					name: roleData.name,
					description: roleData.description,
					permissions: {
						create: roleData.permissions.map(permission => ({
							permission
						}))
					}
				}
			});

			console.log(`Created role: ${role.name}`);
		}

		// Assign Administrator role to all existing admin users
		const adminRole = await prisma.role.findUnique({
			where: { name: 'Administrator' }
		});

		if (adminRole) {
			const adminUsers = await prisma.users.findMany({
				where: { isAdmin: true }
			});

			for (const user of adminUsers) {
				await prisma.userRole.create({
					data: {
						userId: user.id,
						roleId: adminRole.id
					}
				});
				console.log(`Assigned Administrator role to user: ${user.email}`);
			}
		}

		// Assign User role to all non-admin users
		const userRole = await prisma.role.findUnique({
			where: { name: 'User' }
		});

		if (userRole) {
			const regularUsers = await prisma.users.findMany({
				where: { isAdmin: false }
			});

			for (const user of regularUsers) {
				await prisma.userRole.create({
					data: {
						userId: user.id,
						roleId: userRole.id
					}
				});
				console.log(`Assigned User role to user: ${user.email}`);
			}
		}

		console.log('Default roles and permissions setup completed successfully');
	} catch (error) {
		console.error('Error setting up default roles:', error);
	} finally {
		await prisma.$disconnect();
	}
}

setupDefaultRoles();