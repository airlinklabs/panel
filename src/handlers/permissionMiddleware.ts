import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from './logger';

const prisma = new PrismaClient();

export const hasPermission = (requiredPermission: string): RequestHandler => {

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.session?.user) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Admin users bypass permission checks
            if (req.session.user.isAdmin) {
                next();
                return;
            }

            // Get user's roles and their permissions
            const userRoles = await prisma.userRole.findMany({
                where: { userId: req.session.user.id },
                include: {
                    role: {
                        include: {
                            permissions: true
                        }
                    }
                }
            });

            // Check if user has the required permission in any of their roles
            const hasRequiredPermission = userRoles.some(userRole => 
                userRole.role.permissions.some(p => p.permission === requiredPermission)
            );

            if (hasRequiredPermission) {
                next();
            } else {
                logger.warn(`Permission denied: User ${req.session.user.id} attempted to access ${requiredPermission}`);
                res.status(403).json({ error: 'Permission denied' });
            }
        } catch (error) {
            logger.error('Permission check error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
};

export const hasAnyPermission = (permissions: string[]): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.session?.user) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (req.session.user.isAdmin) {
                next();
                return;
            }

            const userRoles = await prisma.userRole.findMany({
                where: { userId: req.session.user.id },
                include: {
                    role: {
                        include: {
                            permissions: true
                        }
                    }
                }
            });

            const hasAnyRequiredPermission = userRoles.some(userRole => 
                userRole.role.permissions.some(p => permissions.includes(p.permission))
            );

            if (hasAnyRequiredPermission) {
                next();
            } else {
                logger.warn(`Permission denied: User ${req.session.user.id} attempted to access one of ${permissions.join(', ')}`);
                res.status(403).json({ error: 'Permission denied' });
            }
        } catch (error) {
            logger.error('Permission check error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
};