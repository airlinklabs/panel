import { Request } from 'express';

export interface User {
  username?: string;
  id?: number;
  description?: string;
  isAdmin?: boolean;
  email?: string;
}

export async function getUser(req: Request) {
  const userObject: User = {
    username: req.session?.user?.username,
    id: req.session?.user?.id,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    isAdmin: req?.session?.user?.isAdmin,
    email: req.session?.user?.email,
  };
}
