import prisma from '../db';
import logger from './logger';
import { daemonRequest } from './utils/core/daemonRequest';
import { queueer } from './queueer';

export async function processQueuedServerInstalls(): Promise<void> {
  const servers = await prisma.server.findMany({
    where: { Queued: true },
    include: { image: true, node: true },
  });

  for (const server of servers) {
    if (!server.Variables) {
      await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
      continue;
    }

    let serverEnv: any[];
    try {
      const rawVars = JSON.parse(server.Variables);
      serverEnv = rawVars.map((v: any) => ({
        env: String(v.env_variable ?? v.env ?? ''),
        value: v.value ?? v.default_value ?? '',
      }));
      let serverPort: string | number = '';
      try {
        const parsedPorts = JSON.parse(server.Ports);
        const primary = parsedPorts.find((p: any) => p.primary);
        if (primary?.Port) {
          serverPort = parseInt(String(primary.Port).split(':')[0] ?? '');
        }
      } catch { /* keep fallback */ }
      serverEnv.push({ env: 'SERVER_PORT', value: serverPort });
      serverEnv.push({ env: 'SERVER_MEMORY', value: String(server.Memory) });
      serverEnv.push({ env: 'SERVER_CPU',    value: String(server.Cpu) });
    } catch (err) {
      logger.error(`Error parsing Variables for server ${server.id}:`, err);
      await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
      continue;
    }

    const env = serverEnv.reduce((acc: any, curr: any) => {
      acc[curr.env] = curr.value;
      return acc;
    }, {});

    if (!server.image?.scripts) {
      await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
      continue;
    }

    let scripts: Record<string, unknown>;
    try {
      scripts = JSON.parse(server.image.scripts);
    } catch (err) {
      logger.error(`Error parsing scripts for server ${server.id}:`, err);
      await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
      continue;
    }

    try {
      if (scripts.installation && typeof scripts.installation === 'object') {
        const inst = scripts.installation as { script: string; container: string; entrypoint: string };
        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/container/installer',
          body: { id: server.UUID, script: inst.script, container: inst.container, entrypoint: inst.entrypoint || 'bash', env },
          timeout: 600000,
        });
      } else if (Array.isArray(scripts.install)) {
        let dockerImageValue: string | undefined;
        try {
          const parsed = JSON.parse(server.dockerImage || '{}');
          dockerImageValue = Object.values(parsed)[0] as string | undefined;
        } catch { /* leave undefined */ }

        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/container/install',
          body: {
            id: server.UUID,
            image: dockerImageValue,
            env,
            scripts: (scripts.install as any[]).map((s: any) => ({
              url: s.url,
              onStartup: s.onStart,
              ALVKT: s.ALVKT,
              fileName: s.fileName,
            })),
          },
          timeout: 600000,
        });
      }
      await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
    } catch (err) {
      // The daemon never received the install, so nothing will ever flip the
      // state. Clear both flags so the server surfaces as failed instead of
      // being stranded as "installing" forever.
      logger.error(`Error sending install request for server ${server.id}:`, err);
      await prisma.server.update({
        where: { id: server.id },
        data: { Queued: false, Installing: false },
      });
    }
  }
}

export function reenqueueQueuedInstalls(): void {
  queueer.addTask(async () => {
    try {
      const pending = await prisma.server.count({ where: { Queued: true } });
      if (pending > 0) {
        logger.info(`Recovering ${pending} queued installation(s) after restart`);
        await processQueuedServerInstalls();
      }
    } catch (error) {
      logger.error('Error recovering queued installs on boot:', error);
    }
  });
}
