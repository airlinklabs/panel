import { Request } from 'express';

export interface User {
  username?: string;
  id?: number;
  description?: string;
  isAdmin?: boolean;
  email?: string;
}

export function getUser(req: Request) {
  const user = {
    username: req.session?.user?.username,
    id: req.session?.user?.id,
    description: req.session?.user?.description,
    isAdmin: req.session?.user?.isAdmin,
    email: req.session?.user?.email,
  };
  return user;
}
