import { RequestHandler } from 'express';
import { prisma } from '../../utils/prisma';
import { ApiKey, Users } from '@prisma/client';
import { ApiResponse } from '../../../types/api';

interface ApiKeyWithUser extends ApiKey {
	user: Users;
}

declare global {
	namespace Express {
		interface Request {
			user?: {
				id: number;
				email: string;
				isAdmin: boolean;
			};
			apiKey?: ApiKeyWithUser;
		}
	}
}

export const apiKeyMiddleware: RequestHandler = async (req, res, next): Promise<void> => {
	try {
		const apiKey = req.headers['x-api-key'];
		if (!apiKey || typeof apiKey !== 'string') {
			res.status(401).json({
				success: false,
				error: 'API key is required'
			});
			return;
		}

		const key = await prisma.apiKey.findUnique({
			where: { key: apiKey },
			include: { user: true }
		});

		if (!key || !key.user) {
			res.status(401).json({
				success: false,
				error: 'Invalid API key'
			});
			return;
		}

		if (!key.active) {
			res.status(403).json({
				success: false,
				error: 'API key is inactive'
			});
			return;
		}

		if (key.expiresAt && new Date() > key.expiresAt) {
			await prisma.apiKey.update({
				where: { id: key.id },
				data: { active: false }
			});
			res.status(403).json({
				success: false,
				error: 'API key has expired'
			});
			return;
		}

		const clientIp = req.socket.remoteAddress;
		if (key.ipRestrictions && clientIp) {
			const allowedIps = key.ipRestrictions.split(',').map(ip => ip.trim());
			if (!allowedIps.includes(clientIp)) {
				res.status(403).json({
					success: false,
					error: 'IP address not allowed'
				});
				return;
			}
		}

		const now = new Date();
		if (key.lastReset) {
			const minutesPassed = (now.getTime() - key.lastReset.getTime()) / (1000 * 60);

			if (minutesPassed >= 60) {
				await prisma.apiKey.update({
					where: { id: key.id },
					data: {
						requestCount: 1,
						lastReset: now,
						lastUsed: now,
						updatedAt: now
					}
				});
				setRequestContext(req, key);
				next();
			} else if (key.requestCount >= key.rateLimit) {
				res.status(429).json({
					success: false,
					error: 'Rate limit exceeded',
					message: `Reset in ${Math.ceil(60 - minutesPassed)} seconds`
				});
			} else {
				await prisma.apiKey.update({
					where: { id: key.id },
					data: {
						requestCount: { increment: 1 },
						lastUsed: now,
						updatedAt: now
					}
				});
				setRequestContext(req, key);
				next();
			}
		}
	} catch (error) {
		console.error('API Auth Error:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
};

function setRequestContext(req: Express.Request, key: ApiKeyWithUser): void {
	req.user = {
		id: key.user.id,
		email: key.user.email,
		isAdmin: key.user.isAdmin
	};
	req.apiKey = key;
}

export const checkPermission = (resource: string, action: 'read' | 'write'): RequestHandler => {
	return (req, res, next): void => {
		const apiKey = req.apiKey;
		if (!apiKey?.permissions) {
			res.status(403).json({
				success: false,
				error: 'No permissions defined'
			});
			return;
		}

		const permissions = apiKey.permissions as Record<string, string>;
		const permission = permissions[resource];

		if (!permission) {
			res.status(403).json({
				success: false,
				error: `No permissions defined for ${resource}`
			});
			return;
		}

		if (action === 'write' && permission !== 'write') {
			res.status(403).json({
				success: false,
				error: `Write permission required for ${resource}`
			});
			return;
		}

		if (action === 'read' && !['read', 'write'].includes(permission)) {
			res.status(403).json({
				success: false,
				error: `Read permission required for ${resource}`
			});
			return;
		}

		next();
	};
};


