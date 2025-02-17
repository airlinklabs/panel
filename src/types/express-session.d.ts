import 'express-session';

declare module 'express-session' {
	interface SessionData {
		user: {
			id: number;
			email: string;
			isAdmin: boolean;
			username: string;
			description: string;
			roles: Array<{
				role: {
					id: number;
					name: string;
					permissions: Array<{ permission: string }>;
				};
			}>;
		} | undefined;
	}
}