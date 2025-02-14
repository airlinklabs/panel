import { ApiKey, Users, Server, Location, Node, Images } from '@prisma/client';

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface ApiKeyResponse extends ApiKey {
	user: Pick<Users, 'id' | 'email' | 'username'>;
}

export interface ApiKeyStatsResponse extends ApiKeyResponse {
	statistics: {
		remainingRequests: number;
		resetInMinutes: number;
		usagePercentage: number;
		isExpired: boolean;
		lastUsed: Date | null;
	};
}

export type ResourcePermission = 'read' | 'write' | 'none';
export type ResourcePermissions = Record<string, ResourcePermission>;

export interface CreateApiKeyDto {
	name: string;
	description?: string;
	rateLimit?: number;
	ipRestrictions?: string;
	expiresAt?: string;
	permissions: ResourcePermissions;
}

export interface UpdateApiKeyDto extends Partial<CreateApiKeyDto> {}