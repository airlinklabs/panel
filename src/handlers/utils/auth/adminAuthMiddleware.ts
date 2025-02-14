import { RequestHandler } from 'express';

export const checkAdmin: RequestHandler = (req, res, next): void => {
	if (!req.user) {
		res.status(401).json({ error: 'Authentication required' });
		return;
	}

	if (!req.user.isAdmin) {
		res.status(403).json({ error: 'Admin access required' });
		return;
	}

	next();
};