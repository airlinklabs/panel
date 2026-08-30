import prisma from "../db";

export async function listLocations(params: { page: number; perPage: number }) {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { name: "asc" },
  });
  return locations;
}

export async function createLocation(data: {
  name: string;
  shortCode: string;
}) {
  const location = await prisma.location.create({
    data: { name: data.name, shortCode: data.shortCode },
  });
  return location;
}
