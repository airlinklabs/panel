import type { ApiKey, SubUser, Users } from '../generated/prisma/client';

export interface PanelSessionUser {
  id: number;
  email: string;
  isAdmin: boolean;
  username: string;
  description: string;
  role?: string;
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
}

declare module 'express-session' {
  interface SessionData {
    user: PanelSessionUser;
    pendingUserId?: number;
    pendingTotpSecret?: string;
    pendingWebAuthnChallenge?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      nonce?: string;
      lang?: string;
      translations?: Record<string, unknown>;
      cookies?: Record<string, string>;
      // Attached by isAuthenticatedForServer / isAuthenticatedForServerWS when
      // the request is made by a subuser rather than an owner or admin.
      subUser?: SubUser;
      // Attached by the validation boundary (src/utils/validation.ts) after a
      // feature-local Zod schema parses the raw request. Handlers must read
      // the parsed value, never req.body/params/query directly.
      validatedBody?: unknown;
      validatedParams?: unknown;
      validatedQuery?: unknown;
      // Server context when on a server page (attached by isAuthenticatedForServer)
      server?: {
        id: number;
        UUID: string;
        name: string;
        nodeId: number;
        // ... other server fields
      };
      // Node context when on a server page
      node?: {
        id: number;
        name: string;
        address: string;
        port: number;
        // ... other node fields
      };
      // Features array for feature-gating
      features?: string[];
      // Set by htmx middleware — true when the request has HX-Request header
      htmx?: boolean;
      // Attached by admin auth middleware (requireAdmin) — the authenticated admin user record
      adminUser?: Users;
    }

    interface Response {
      // Admin sidebar groups for navigation
      adminSidebarGroups?: {
        label: string;
        items: {
          url: string;
          label: string;
          icon: string;
          matchPrefix?: string;
          isAdminItem?: boolean;
          ownerOnly?: boolean;
          feature?: string;
          group?: string;
        }[];
      }[];
    }
  }
}

export {};
