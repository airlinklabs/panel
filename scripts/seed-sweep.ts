// Seed a minimal dataset so page/API sweeps hit real records:
//   Image -> Node -> Server (fixed UUID for sweep param substitution)
// Usage: node --import tsx --env-file=.env scripts/seed-sweep.ts
import prisma from '../src/db';

async function main() {
  const image =
  (await prisma.images.findFirst({ where: { name: 'Minecraft' } })) ??
  (await prisma.images.create({
    data: {
      name: 'Minecraft',
      description: 'Seed image',
      status: 'approved',
      dockerImages: ['itzg/minecraft-server'],
      startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
      stop: 'stop',
      variables: [],
    },
  }));

  const node =
  (await prisma.node.findFirst({ where: { name: 'Test Node' } })) ??
  (await prisma.node.create({
    data: { name: 'Test Node', key: 'test-node-key', address: '127.0.0.1' },
  }));

  const UUID = '11111111-2222-4333-8444-555555555555';
  const seedFields = {
    name: 'Test Server',
    description: 'Seed server for sweeps',
    Variables: [
      { name: 'EULA', env: 'EULA', type: 'boolean', default: 'TRUE', value: true, rules: '' },
      {
        name: 'Message of the Day',
        env: 'MOTD',
        type: 'text',
        default: 'A Minecraft Server',
        value: 'A Minecraft Server',
        rules: '',
      },
    ],
    StartCommand: 'java -Xms128M -Xmx1024M -jar server.jar',
    dockerImage: 'itzg/minecraft-server',
    // Fixture must allow startup edits — otherwise sub-form saves 403.
    allowStartupEdit: true,
  };
  const server =
  (await prisma.server.findUnique({ where: { UUID } })) ??
  (await prisma.server.create({
    data: {
      UUID,
      Ports: [{ Port: '25565', primary: true }],
      Memory: 1024,
      Cpu: 100,
      Storage: 5120,
      Installing: false,
      Queued: false,
      Suspended: false,
      Running: false,
      backupLimit: 5,
      databaseLimit: 2,
      ownerId: 1,
      nodeId: node.id,
      imageId: image.id,
      ...seedFields,
    },
  }));

  // Re-apply fixture fields on every run so stale rows (older seeds, tests
  // that mutate data) never leave the sweep in a broken state.
  await prisma.server.update({ where: { UUID }, data: seedFields });

  console.log(
    JSON.stringify({ imageId: image.id, nodeId: node.id, serverUUID: server.UUID }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
