import prisma from "../db";

export async function seedDefaultRoles() {
  const defaults = [
    {
      name: "owner",
      displayName: "Owner",
      isAdmin: true,
      isSystem: true,
      permissions: JSON.stringify(["*"]),
      sortOrder: 0,
    },
    {
      name: "admin",
      displayName: "Administrator",
      isAdmin: true,
      isSystem: true,
      permissions: JSON.stringify(["*"]),
      sortOrder: 1,
    },
    {
      name: "privileged",
      displayName: "Privileged User",
      isAdmin: false,
      isSystem: true,
      permissions: JSON.stringify([
        "servers.create",
        "servers.view",
        "backups.*",
        "files.*",
        "schedules.*",
        "databases.*",
      ]),
      sortOrder: 2,
    },
    {
      name: "user",
      displayName: "User",
      isAdmin: false,
      isSystem: true,
      permissions: JSON.stringify(["servers.create", "servers.view"]),
      sortOrder: 3,
    },
  ];
  for (const role of defaults) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
}

export async function ensureDefaultRoles() {
  const count = await prisma.role.count();
  if (count === 0) {
    await seedDefaultRoles();
  }
}
