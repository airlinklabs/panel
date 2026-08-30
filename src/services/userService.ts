import prisma from "../db";
import bcrypt from "bcryptjs";
import { BCRYPT_SALT_ROUNDS } from "../config/constants";

type UserSelect = {
  id: true;
  username: true;
  email: true;
  isAdmin: true;
  role: true;
  description: true;
};

const USER_SELECT: UserSelect = {
  id: true,
  username: true,
  email: true,
  isAdmin: true,
  role: true,
  description: true,
};

export interface ListUsersParams {
  page: number;
  perPage: number;
  include?: string[];
  filter?: Record<string, unknown>;
}

export async function listUsers(params: ListUsersParams) {
  const users = await prisma.users.findMany({
    where: params.filter || {},
    select: USER_SELECT,
  });

  let servers: Awaited<ReturnType<typeof prisma.server.findMany>> = [];
  if (params.include?.includes("servers")) {
    servers = await prisma.server.findMany({
      where: { ownerId: { in: users.map((u) => u.id) } },
      include: { node: true, owner: true },
    });
  }

  return { users, servers };
}

export async function getUser(id: number) {
  return prisma.users.findUnique({
    where: { id },
    select: USER_SELECT,
  });
}

export async function getUserFull(id: number) {
  return prisma.users.findUnique({ where: { id } });
}

export async function findUserByEmail(email: string) {
  return prisma.users.findUnique({ where: { email } });
}

export async function findUserByUsername(username: string) {
  return prisma.users.findUnique({ where: { username } });
}

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  isAdmin?: boolean;
  role?: string;
  description?: string;
}) {
  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  const role = data.role ?? (data.isAdmin ? "admin" : "user");

  return prisma.users.create({
    data: {
      email: data.email,
      username: data.username,
      password: hashedPassword,
      isAdmin: data.isAdmin ?? false,
      role,
      description: data.description ?? null,
    },
    select: USER_SELECT,
  });
}

export async function updateUser(
  id: number,
  data: {
    email?: string;
    username?: string;
    password?: string;
    isAdmin?: boolean;
    role?: string;
    description?: string;
  },
) {
  const updateData: Record<string, unknown> = {};

  if (data.email !== undefined) updateData.email = data.email;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.password !== undefined) {
    updateData.password = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  }

  return prisma.users.update({
    where: { id },
    data: updateData,
    select: USER_SELECT,
  });
}

export async function isLastAdmin(userId: number): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || !(user.role === "owner" || user.role === "admin")) return false;

  const adminCount = await prisma.users.count({
    where: { role: { in: ["owner", "admin"] } },
  });
  return adminCount <= 1;
}

export async function deleteUser(id: number) {
  return prisma.users.delete({ where: { id } });
}

export async function countUsers() {
  return prisma.users.count();
}
