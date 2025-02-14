import { ApiKey, Users } from '@prisma/client';

export interface ApiKeyWithUser extends ApiKey {
	user: Users;
}

export interface ApiKeyPermissions {
	allocations?: 'read' | 'write' | 'none';
	databases?: 'read' | 'write' | 'none';
	images?: 'read' | 'write' | 'none';
	locations?: 'read' | 'write' | 'none';
	nests?: 'read' | 'write' | 'none';
	nodes?: 'read' | 'write' | 'none';
	servers?: 'read' | 'write' | 'none';
	users?: 'read' | 'write' | 'none';
}

export interface ApiKeyStats {
	remainingRequests: number;
	resetInMinutes: number;
	usagePercentage: number;
	isExpired: boolean;
	lastUsed: Date | null;
}

export interface ApiKeyResponse {
	id: number;
	key: string;
	name: string;
	description?: string;
	rateLimit: number;
	ipRestrictions?: string;
	expiresAt?: Date;
	active: boolean;
	requestCount: number;
	lastReset: Date;
	lastUsed?: Date;
	permissions: ApiKeyPermissions;
	user: {
		id: number;
		email: string;
		username?: string;
	};
}