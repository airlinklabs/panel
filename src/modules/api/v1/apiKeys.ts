import { Router, Request, Response } from 'express';
import { prisma } from '../../../handlers/utils/prisma';
import { checkAdmin } from '../../../handlers/utils/auth/adminAuthMiddleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Prisma, ApiKey } from '@prisma/client';

const router = Router();

// Validation schemas
const createApiKeySchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	rateLimit: z.number().int().min(1).max(1000).default(60),
	ipRestrictions: z.string().optional(),
	expiresAt: z.string().optional(),
	permissions: z.record(z.enum(['read', 'write', 'none']))
});

const updateApiKeySchema = createApiKeySchema.partial();

// Get all API keys with pagination
router.get('/', checkAdmin, (req: Request, res: Response): void => {
	const page = parseInt(req.query.page as string) || 1;
	const limit = parseInt(req.query.limit as string) || 10;
	const skip = (page - 1) * limit;

	Promise.all([
		prisma.apiKey.findMany({
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
			include: {
				user: {
					select: {
						id: true,
						email: true,
						username: true
					}
				}
			}

		}),
		prisma.apiKey.count()
	]).then(([apiKeys, total]) => {
		res.json({
			data: apiKeys,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	}).catch(error => {
		console.error('Error fetching API keys:', error);
		res.status(500).json({ error: 'Internal server error' });
	});
});


// Create new API key
router.post('/', checkAdmin, (req: Request, res: Response): void => {
	try {
		const validatedData = createApiKeySchema.parse(req.body);
		const key = randomBytes(32).toString('hex');

		const data: Prisma.ApiKeyCreateInput = {
			key,
			name: validatedData.name,
			description: validatedData.description,
			rateLimit: validatedData.rateLimit,
			ipRestrictions: validatedData.ipRestrictions,
			expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : null,
			permissions: validatedData.permissions,
			user: { connect: { id: req.user!.id } },
			active: true,
			lastReset: new Date()
		};

		prisma.apiKey.create({ data }).then(apiKey => {
			res.status(201).json({
				...apiKey,
				key
			});
		}).catch(error => {
			console.error('Error creating API key:', error);
			res.status(500).json({ error: 'Internal server error' });
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			res.status(400).json({ error: 'Validation error', details: error.format() });
			return;
		}
		console.error('Error creating API key:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Update API key
router.put('/:id', checkAdmin, (req: Request, res: Response): void => {
	try {
		const { id } = req.params;
		const validatedData = updateApiKeySchema.parse(req.body);

		const data: Prisma.ApiKeyUpdateInput = {
			name: validatedData.name,
			description: validatedData.description,
			rateLimit: validatedData.rateLimit,
			ipRestrictions: validatedData.ipRestrictions,
			expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
			permissions: validatedData.permissions,
			updatedAt: new Date()
		};

		prisma.apiKey.update({
			where: { id: parseInt(id) },
			data,
			include: {
				user: {
					select: {
						id: true,
						email: true,
						username: true
					}
				}
			}
		}).then(apiKey => {
			res.json(apiKey);
		}).catch(error => {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
				res.status(404).json({ error: 'API key not found' });
				return;
			}
			console.error('Error updating API key:', error);
			res.status(500).json({ error: 'Internal server error' });
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			res.status(400).json({ error: 'Validation error', details: error.format() });
			return;
		}
		console.error('Error updating API key:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// Toggle API key status
router.post('/:id/toggle', checkAdmin, (req: Request, res: Response): void => {
	const { id } = req.params;
	
	prisma.apiKey.findUnique({
		where: { id: parseInt(id) }
	}).then(existingKey => {
		if (!existingKey) {
			res.status(404).json({ error: 'API key not found' });
			return;
		}

		prisma.apiKey.update({
			where: { id: parseInt(id) },
			data: { 
				active: !existingKey.active,
				updatedAt: new Date()
			},
			include: {
				user: {
					select: {
						id: true,
						email: true,
						username: true
					}
				}
			}
		}).then(updatedKey => {
			res.json(updatedKey);
		}).catch(error => {
			console.error('Error toggling API key:', error);
			res.status(500).json({ error: 'Internal server error' });
		});
	}).catch(error => {
		console.error('Error finding API key:', error);
		res.status(500).json({ error: 'Internal server error' });
	});
});

// Delete API key with confirmation
router.delete('/:id', checkAdmin, (req: Request, res: Response): void => {
	const { id } = req.params;
	const { confirmation } = req.body;

	if (confirmation !== 'DELETE') {
		res.status(400).json({ error: 'Confirmation required' });
		return;
	}

	prisma.apiKey.delete({
		where: { id: parseInt(id) }
	}).then(() => {
		res.status(204).send();
	}).catch(error => {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
			res.status(404).json({ error: 'API key not found' });
			return;
		}
		console.error('Error deleting API key:', error);
		res.status(500).json({ error: 'Internal server error' });
	});
});

// Get API key usage stats with detailed information
router.get('/:id/stats', checkAdmin, (req: Request, res: Response): void => {
	const { id } = req.params;

	prisma.apiKey.findUnique({
		where: { id: parseInt(id) },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					username: true
				}
			}
		}
	}).then(apiKey => {
		if (!apiKey) {
			res.status(404).json({ error: 'API key not found' });
			return;
		}

		const now = new Date();
		const resetTime = apiKey.lastReset;
		const minutesPassed = (now.getTime() - resetTime.getTime()) / (1000 * 60);

		res.json({
			...apiKey,
			statistics: {
				remainingRequests: Math.max(0, apiKey.rateLimit - apiKey.requestCount),
				resetInMinutes: Math.max(0, 60 - minutesPassed),
				usagePercentage: (apiKey.requestCount / apiKey.rateLimit) * 100,
				isExpired: apiKey.expiresAt ? now > apiKey.expiresAt : false,
				lastUsed: apiKey.lastUsed || null
			}
		});

	}).catch(error => {
		console.error('Error fetching API key stats:', error);
		res.status(500).json({ error: 'Internal server error' });
	});
});


export default router;

