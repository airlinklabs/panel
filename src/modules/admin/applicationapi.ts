import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { prisma } from '../../handlers/utils/prisma';
import { checkAdmin } from '../../handlers/utils/auth/adminAuthMiddleware';

const router = Router();

// API Keys Management Page
router.get('/api-keys', checkAdmin, async (req: Request, res: Response): Promise<void> => {
	try {
		const apiKeys = await prisma.apiKey.findMany({
			include: {
				user: {
					select: {
						id: true,
						username: true
					}
				}
			},
			orderBy: { createdAt: 'desc' }
		});

		res.render('admin/applicationapi/api-keys', {
			apiKeys,
			user: req.user,
			settings: req.app.locals.settings
		});
	} catch (error) {
		console.error('Error fetching API keys:', error);
		res.status(500).send('Internal Server Error');
	}
});

// API Analytics Page
router.get('/api-analytics', checkAdmin, async (req: Request, res: Response): Promise<void> => {
	try {
		// Get analytics data
		const totalRequests = await prisma.apiRequest.count();
		const successfulRequests = await prisma.apiRequest.count({
			where: { statusCode: { lt: 400 } }
		});
		const failedRequests = await prisma.apiRequest.count({
			where: { statusCode: { gte: 400 } }
		});

		// Calculate success rate
		const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

		// Get average response time
		const avgResponseTime = await prisma.apiRequest.aggregate({
			_avg: { responseTime: true }
		});

		res.render('admin/applicationapi/api-analytics', {
			metrics: {
				totalRequests,
				successRate: successRate.toFixed(2),
				avgResponseTime: Math.round(avgResponseTime._avg.responseTime || 0),
				errorRate: ((failedRequests / totalRequests) * 100).toFixed(2)
			},
			user: req.user,
			settings: req.app.locals.settings
		});
	} catch (error) {
		console.error('Error fetching API analytics:', error);
		res.status(500).send('Internal Server Error');
	}
});

// API Documentation Page
router.get('/api-docs', checkAdmin, async (req: Request, res: Response): Promise<void> => {
	try {
		// Define available API endpoints
		const endpoints = [
			{
				path: '/api/v1/servers',
				description: 'Manage game servers',
				methods: ['GET', 'POST', 'PUT', 'DELETE']
			},
			{
				path: '/api/v1/users',
				description: 'User management endpoints',
				methods: ['GET', 'POST', 'PUT', 'DELETE']
			},
			{
				path: '/api/v1/nodes',
				description: 'Node management endpoints',
				methods: ['GET', 'POST', 'PUT', 'DELETE']
			}
			// Add more endpoints as needed
		];

		res.render('admin/applicationapi/api-docs', {
			endpoints,
			user: req.user,
			settings: req.app.locals.settings
		});
	} catch (error) {
		console.error('Error loading API documentation:', error);
		res.status(500).send('Internal Server Error');
	}
});

// API Analytics Data Endpoints
router.get('/api-analytics/metrics', checkAdmin, async (req: Request, res: Response): Promise<void> => {
	try {
		const [totalRequests, successfulRequests, avgResponseTime] = await Promise.all([
			prisma.apiRequest.count(),
			prisma.apiRequest.count({ where: { statusCode: { lt: 400 } } }),
			prisma.apiRequest.aggregate({ _avg: { responseTime: true } })
		]);

		const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

		res.json({
			totalRequests,
			successRate: successRate.toFixed(2),
			avgResponseTime: Math.round(avgResponseTime._avg.responseTime || 0),
			errorRate: (100 - successRate).toFixed(2)
		});
	} catch (error) {
		console.error('Error fetching API metrics:', error);
		res.status(500).json({ error: 'Internal Server Error' });
	}
});

const applicationApiModule: Module = {
	info: {
		name: 'Application API Module',
		description: 'API management and analytics functionality',
		version: '1.0.0',
		moduleVersion: '1.0.0',
		author: 'AirLinkLab',
		license: 'MIT',
	},
	router: () => router
};

export default applicationApiModule;