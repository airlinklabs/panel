import { Request } from 'express';

interface UserResponse {
  id: number;
  isAdmin: boolean;
  username: string;
  email: string;
  description: string;
  roles: Array<{
    role: {
      id: number;
      name: string;
      permissions: Array<{ permission: string }>;
    };
  }>;
}

export const getUser = (req: Request): UserResponse | null => {
  if (!req.session?.user) {
    return null;
  }

  return {
    id: req.session.user.id,
    isAdmin: req.session.user.isAdmin,
    username: req.session.user.username,
    email: req.session.user.email,
    description: req.session.user.description,
    roles: req.session.user.roles || []
  };
};

export const isAuthenticated = (req: Request): boolean => {
  return !!req.session?.user;
};
