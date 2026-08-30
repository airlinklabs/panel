import prisma from "../db";

export interface ImageListParams {
  page: number;
  perPage: number;
}

export interface ImageListResult {
  data: Array<{
    id: number;
    UUID: string;
    name: string | null;
    description: string | null;
    author: string | null;
    authorName: string | null;
    startup: string | null;
    stop: string | null;
    createdAt: Date;
  }>;
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

const LIST_SELECT = {
  id: true,
  UUID: true,
  name: true,
  description: true,
  author: true,
  authorName: true,
  startup: true,
  stop: true,
  createdAt: true,
} as const;

const CREATE_SELECT = {
  id: true,
  UUID: true,
  name: true,
  description: true,
  startup: true,
  createdAt: true,
} as const;

export async function listImages(
  params: ImageListParams,
): Promise<ImageListResult> {
  const { page, perPage } = params;

  const images = await prisma.images.findMany({
    select: LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  const total = images.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.max(1, Math.min(page, lastPage));

  return {
    data: images.slice((safePage - 1) * perPage, safePage * perPage),
    meta: {
      total,
      per_page: perPage,
      current_page: safePage,
      last_page: lastPage,
    },
  };
}

export async function getImage(id: number) {
  return prisma.images.findUnique({ where: { id } });
}

export interface CreateImageData {
  name: string;
  description?: string;
  author?: string;
  authorName?: string;
  startup: string;
  stop?: string;
}

export async function createImage(data: CreateImageData) {
  return prisma.images.create({
    data: {
      name: data.name.trim(),
      description: data.description ?? "",
      author: data.author ?? "",
      authorName: data.authorName ?? "",
      startup: data.startup.trim(),
      stop: data.stop ?? "stop",
      startup_done: "",
      config_files: "",
      meta: JSON.stringify({ version: "AL_V1" }),
      dockerImages: JSON.stringify([]),
      info: JSON.stringify({ features: [] }),
      scripts: JSON.stringify({}),
      variables: JSON.stringify([]),
      portRequirements: JSON.stringify([]),
    },
    select: CREATE_SELECT,
  });
}

export interface UpdateImageData {
  name?: unknown;
  description?: unknown;
  author?: unknown;
  authorName?: unknown;
  startup?: unknown;
  stop?: unknown;
  startup_done?: unknown;
  config_files?: unknown;
  dockerImages?: unknown;
  variables?: unknown;
  info?: unknown;
  scripts?: unknown;
  portRequirements?: unknown;
}

export async function updateImage(id: number, data: UpdateImageData) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.author !== undefined) updateData.author = data.author;
  if (data.authorName !== undefined) updateData.authorName = data.authorName;
  if (data.startup !== undefined) updateData.startup = data.startup;
  if (data.stop !== undefined) updateData.stop = data.stop;
  if (data.startup_done !== undefined)
    updateData.startup_done = data.startup_done;
  if (data.config_files !== undefined)
    updateData.config_files = data.config_files;
  if (data.dockerImages !== undefined)
    updateData.dockerImages = JSON.stringify(data.dockerImages);
  if (data.variables !== undefined)
    updateData.variables = JSON.stringify(data.variables);
  if (data.info !== undefined) updateData.info = JSON.stringify(data.info);
  if (data.scripts !== undefined)
    updateData.scripts = JSON.stringify(data.scripts);
  if (data.portRequirements !== undefined)
    updateData.portRequirements = JSON.stringify(data.portRequirements);

  return prisma.images.update({
    where: { id },
    data: updateData,
    select: CREATE_SELECT,
  });
}

export async function deleteImage(id: number) {
  return prisma.images.delete({ where: { id } });
}

export async function countServersByImage(imageId: number) {
  return prisma.server.count({ where: { imageId } });
}
