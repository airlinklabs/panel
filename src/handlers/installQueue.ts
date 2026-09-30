import prisma from '../db';
import logger from './logger';
import { daemonRequest } from './utils/core/daemonRequest';
import { queueer } from './queueer';
import { getPrimaryExternalPort } from './utils/server/ports';
import { parseDockerImageRef } from '../utils/dockerImage';
import { emitRealtime, serverEvent } from './realtime/events';
import { DAEMON_TIMEOUT_REINSTALL_MS } from '../config/daemonTimeouts';
import { logT } from '../services/i18n';

export async function processQueuedServerInstalls(): Promise<void> {
  const servers = await prisma.server.findMany({
    where: { Queued: true },
    include: { image: true, node: true },
  });

  for (const server of servers) {
    emitRealtime(
      serverEvent('server.install.started', server.UUID, {
        operationId: server.UUID,
        state: { queued: true, installing: true },
      }),
    );
    if (!server.Variables) {
      await prisma.server.update({
        where: { id: server.id },
        data: { Queued: false },
      });
      continue;
    }

    let serverEnv: { env: string; value: string | number }[];
    try {
      const rawVars = (
        Array.isArray(server.Variables) ? server.Variables : []
      ) as Record<string, unknown>[];
      serverEnv = rawVars.map((v) => ({
        env: String(
          (v as Record<string, unknown>).env_variable ??
            (v as Record<string, unknown>).env ??
            '',
        ),
        value: String(
          (v as Record<string, unknown>).value ??
            (v as Record<string, unknown>).default_value ??
            '',
        ),
      }));
      let serverPort: string | number = '';
      try {
        const primaryExternalPort = getPrimaryExternalPort(server.Ports);
        if (primaryExternalPort) {
          serverPort = primaryExternalPort;
        }
      } catch {
        /* keep fallback */
      }
      serverEnv.push({ env: 'SERVER_PORT', value: serverPort });
      serverEnv.push({ env: 'SERVER_MEMORY', value: String(server.Memory) });
      serverEnv.push({ env: 'SERVER_CPU', value: String(server.Cpu) });
    } catch (err) {
      logger.error(logT('log.errorParsingVariables', { id: server.id }), err);
      await prisma.server.update({
        where: { id: server.id },
        data: { Queued: false },
      });
      continue;
    }

    const env = serverEnv.reduce<Record<string, string | number>>(
      (acc, curr) => {
        acc[curr.env] = curr.value;
        return acc;
      },
      {},
    );

    // An image with no scripts (or an object-form null) still needs its
    // volume created — the daemon's install runs `initContainer` and treats
    // an empty script list as a no-op, so dispatch instead of failing.
    let scripts: Record<string, unknown> = {};
    if (server.image?.scripts && typeof server.image.scripts === 'object') {
      scripts = server.image.scripts as Record<string, unknown>;
    } else if (server.image?.scripts) {
      logger.error(
        logT('log.errorParsingScripts', { id: server.id }),
        new Error('image scripts is not an object'),
      );
    }

    try {
      if (scripts.installation && typeof scripts.installation === 'object') {
        const inst = scripts.installation as {
          script: string;
          container: string;
          entrypoint: string;
        };
        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/container/installer',
          body: {
            id: server.UUID,
            script: inst.script,
            container: inst.container,
            entrypoint: inst.entrypoint || 'bash',
            env,
          },
          timeout: DAEMON_TIMEOUT_REINSTALL_MS,
        });
      } else {
        const installArray = Array.isArray(scripts.install)
          ? (scripts.install as Record<string, unknown>[])
          : [];
        const dockerImageValue = parseDockerImageRef(server.dockerImage);

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
            scripts: installArray.map(
              (s) => ({
                url: s.url as string,
                onStartup: s.onStart,
                ALVKT: s.ALVKT,
                fileName: s.fileName,
              }),
            ),
          },
          timeout: DAEMON_TIMEOUT_REINSTALL_MS,
        });
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { Queued: false },
      });
      emitRealtime(
        serverEvent('server.install.completed', server.UUID, {
          operationId: server.UUID,
          state: { installing: false, queued: false },
        }),
      );
    } catch (err) {
      // Clear state flags so the server surfaces as failed instead of being stranded as "installing".
      logger.error(
        logT('log.errorSendingInstallRequest', { id: server.id }),
        err,
      );
      await prisma.server.update({
        where: { id: server.id },
        data: { Queued: false, Installing: false },
      });
      emitRealtime(
        serverEvent('server.install.failed', server.UUID, {
          operationId: server.UUID,
          error: {
            message:
              err instanceof Error ? err.message : 'Install dispatch failed',
          },
        }),
      );
    }
  }
}

export function reenqueueQueuedInstalls(): void {
  queueer.addTask(async () => {
    try {
      const pending = await prisma.server.count({ where: { Queued: true } });
      if (pending > 0) {
        logger.info(logT('log.recoveringQueuedInstalls', { count: pending }));
        await processQueuedServerInstalls();
      }
    } catch (error) {
      logger.error(logT('log.errorRecoveringInstalls'), error);
    }
  });
}
