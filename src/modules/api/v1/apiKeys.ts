import { Router, Request, Response } from 'express';
import { prisma } from '../../../handlers/utils/prisma';
import { checkAdmin } from '../../../handlers/utils/auth/adminAuthMiddleware';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiResponse, PaginatedResponse, ApiKeyResponse, ApiKeyStatsResponse, CreateApiKeyDto, UpdateApiKeyDto } from '../../../types/api';

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
router.get('/', checkAdmin, async (req: Request, res: Response<PaginatedResponse<ApiKeyResponse[]>>): Promise<void> => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const skip = (page - 1) * limit;

		const [apiKeys, total] = await Promise.all([
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
		]);

		res.json({
			success: true,
			data: apiKeys,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		});
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma Error:', error);
			res.status(500).json({
				success: false,
				error: 'Database error',
				pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
			});
			return;
		}
		console.error('Error fetching API keys:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error',
			pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
		});
	}
});

// Create new API key
router.post('/', checkAdmin, async (req: Request<{}, {}, CreateApiKeyDto>, res: Response<ApiResponse<ApiKeyResponse>>): Promise<void> => {
	try {
		const validatedData = createApiKeySchema.parse(req.body);
		const key = randomBytes(32).toString('hex');

		const apiKey = await prisma.apiKey.create({
			data: {
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
		});

		res.status(201).json({
			success: true,
			data: apiKey
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			res.status(400).json({
				success: false,
				error: 'Validation error',
				message: error.errors[0].message
			});
			return;
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma Error:', error);
			res.status(500).json({
				success: false,
				error: 'Database error'
			});
			return;
		}
		console.error('Error creating API key:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

// Update API key
router.put('/:id', checkAdmin, async (req: Request<{ id: string }, {}, UpdateApiKeyDto>, res: Response<ApiResponse<ApiKeyResponse>>): Promise<void> => {
	try {
		const { id } = req.params;
		const validatedData = updateApiKeySchema.parse(req.body);

		const apiKey = await prisma.apiKey.update({
			where: { id: parseInt(id) },
			data: {
				...validatedData,
				expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
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
		});

		res.json({
			success: true,
			data: apiKey
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			res.status(400).json({
				success: false,
				error: 'Validation error',
				message: error.errors[0].message
			});
			return;
		}
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			if (error.code === 'P2025') {
				res.status(404).json({
					success: false,
					error: 'API key not found'
				});
				return;
			}
			console.error('Prisma Error:', error);
			res.status(500).json({
				success: false,
				error: 'Database error'
			});
			return;
		}
		console.error('Error updating API key:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

// Delete API key
router.delete('/:id', checkAdmin, async (req: Request<{ id: string }>, res: Response<ApiResponse<void>>): Promise<void> => {
	try {
		const { id } = req.params;
		const { confirmation } = req.body;

		if (confirmation !== 'DELETE') {
			res.status(400).json({
				success: false,
				error: 'Confirmation required'
			});
			return;
		}

		await prisma.apiKey.delete({
			where: { id: parseInt(id) }
		});

		res.status(204).send();
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			if (error.code === 'P2025') {
				res.status(404).json({
					success: false,
					error: 'API key not found'
				});
				return;
			}
			console.error('Prisma Error:', error);
			res.status(500).json({
				success: false,
				error: 'Database error'
			});
			return;
		}
		console.error('Error deleting API key:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

// Get API key stats
router.get('/:id/stats', checkAdmin, async (req: Request<{ id: string }>, res: Response<ApiResponse<ApiKeyStatsResponse>>): Promise<void> => {
	try {
		const { id } = req.params;
		const apiKey = await prisma.apiKey.findUnique({
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
		});

		if (!apiKey) {
			res.status(404).json({
				success: false,
				error: 'API key not found'
			});
			return;
		}

		const now = new Date();
		const resetTime = apiKey.lastReset;
		const minutesPassed = (now.getTime() - resetTime.getTime()) / (1000 * 60);

		res.json({
			success: true,
			data: {
				...apiKey,
				statistics: {
					remainingRequests: Math.max(0, apiKey.rateLimit - apiKey.requestCount),
					resetInMinutes: Math.max(0, 60 - minutesPassed),
					usagePercentage: (apiKey.requestCount / apiKey.rateLimit) * 100,
					isExpired: apiKey.expiresAt ? now > apiKey.expiresAt : false,
					lastUsed: apiKey.lastUsed || null
				}
			}
		});
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma Error:', error);
			res.status(500).json({
				success: false,
				error: 'Database error'
			});
			return;
		}
		console.error('Error fetching API key stats:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

export default router;

