import { getSettings } from '../../../handlers/settingsCache';
import type { Request, Response } from 'express';
import type { Prisma, Users, settings as PanelSettings } from '../../../generated/prisma/client';
import prisma from '../../../db';
import { getParamAsString } from '../../../utils/typeHelpers';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { getPrimaryExternalPort, portsToDaemonString } from '../../../handlers/utils/server/ports';
import { assertNodeCapacity } from '../../../handlers/utils/server/resourceCheck';
import { emitRealtime, serverEvent } from '../../../handlers/realtime/events';

declare global {
  var serverStoppingStates: Record<string, boolean>;
}

const DAEMON_AUTH_USERNAME = 'Airlink';

/** A daemon start failure with an explicit retry contract for the runtime queue. */
export class ServerStartFailure extends Error {
  readonly retryable: boolean;
  readonly code: 'DAEMON_PORT_CONFLICT' | 'DAEMON_START_FAILED';

  constructor(
    message: string,
    options: {
      code: 'DAEMON_PORT_CONFLICT' | 'DAEMON_START_FAILED';
      retryable: boolean;
      cause: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ServerStartFailure';
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

/**
 * Converts a daemon start response into the user-safe error and retry policy
 * shared by direct starts and queued starts. A host-port bind conflict cannot
 * succeed on retry: an administrator must release or reassign that port.
 */
export function classifyDaemonStartFailure(rawDetail: string): ServerStartFailure {
  const portConflict = rawDetail.match(
    /Bind for (?:\[[^\]]+\]|[^:\s]+):(\d+) failed: port is already allocated/i,
  );
  if (portConflict) {
    return new ServerStartFailure(
      `The server cannot start because port ${portConflict[1]} is already in use on this node. Contact an administrator to assign another port.`,
      { code: 'DAEMON_PORT_CONFLICT', retryable: false, cause: `daemon: ${rawDetail}` },
    );
  }

  return new ServerStartFailure('The daemon could not start the server.', {
    code: 'DAEMON_START_FAILED',
    retryable: true,
    cause: `daemon: ${rawDetail}`,
  });
}

export interface ErrorMessage {
  message?: string;
}

export interface ServerVariable {
  name: string;
  env: string;
  type: 'boolean' | 'text' | 'number';
  default: string | number | boolean;
  value: string | number | boolean;
  rules?: string;
  rules_field?: string;
  rulesField?: string;
  rulesMessage?: string;
}

export const serverPageInclude = {
  node: true,
  image: true,
  owner: true,
} satisfies Prisma.ServerInclude;

export type ServerPageServer = Prisma.ServerGetPayload<{ include: typeof serverPageInclude }>;

export type ServerPageContext =
  | {
      status: 'ready';
      settings: PanelSettings | null;
      user: Users;
      server: ServerPageServer;
    }
  | {
      status: 'missing-user';
      settings: PanelSettings | null;
      user: null;
    }
  | {
      status: 'missing-server';
      settings: PanelSettings | null;
      user: Users;
    };

export type AuthenticatedServerContext =
  | {
      status: 'ready';
      user: Users;
      server: ServerPageServer;
    }
  | {
      status: 'missing-user';
      user: null;
    }
  | {
      status: 'missing-server';
      user: Users;
    };

export function getAuthenticatedUserId(req: Request): number {
  const userId = req.session?.user?.id;
  if (!userId) {
    throw new Error('Authenticated server request is missing a session user id.');
  }
  return userId;
}

export async function loadServerPageContext(req: Request): Promise<ServerPageContext> {
  const userId = getAuthenticatedUserId(req);
  const serverId = String(req.params?.id);

  const [settings, user] = await Promise.all([
    await getSettings(),
    prisma.users.findUnique({ where: { id: userId } }),
  ]);

  if (!user) {
    return { status: 'missing-user', settings, user: null };
  }

  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: serverPageInclude,
  });

  if (!server) {
    return { status: 'missing-server', settings, user };
  }

  return { status: 'ready', settings, user, server };
}

export async function loadAuthenticatedServerContext(req: Request): Promise<AuthenticatedServerContext> {
  const userId = getAuthenticatedUserId(req);
  const serverId = getParamAsString(req.params?.id);

  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) {
    return { status: 'missing-user', user: null };
  }

  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: serverPageInclude,
  });

  if (!server) {
    return { status: 'missing-server', user };
  }

  return { status: 'ready', user, server };
}

export function sendMissingServerContext(
  res: Response,
  context: AuthenticatedServerContext,
): context is Exclude<AuthenticatedServerContext, { status: 'ready' }> {
  if (context.status === 'missing-user') {
    res.status(404).json({ error: 'User not found' });
    return true;
  }

  if (context.status === 'missing-server') {
    res.status(404).json({ error: 'Server not found' });
    return true;
  }

  return false;
}

export function getServerDaemonAuth(server: Pick<ServerPageServer, 'node'>): { username: string; password: string } {
  return {
    username: DAEMON_AUTH_USERNAME,
    password: server.node.key,
  };
}

export function getServerStatusInput(server: Pick<ServerPageServer, 'UUID' | 'node'>) {
  return {
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    serverUUID: server.UUID,
    nodeKey: server.node.key,
  };
}

export function getImageFeatures(image: { info?: string | null } | null | undefined): string[] {
  if (!image) {return [];}
  try {
    const info = typeof image.info === 'string' ? JSON.parse(image.info) : image.info;
    return Array.isArray(info?.features) ? info.features : [];
  } catch {
    return [];
  }
}

export function buildEnvVariables(variables: string | null | ServerVariable[]): Record<string, string> {
  if (!variables) {return {};}
  try {
    const parsed: unknown = Array.isArray(variables) ? variables : JSON.parse(variables);
    if (!Array.isArray(parsed)) {return {};}
    const env: Record<string, string> = {};
    for (const v of parsed) {
      const key = v.env_variable || v.env;
      if (!key) {continue;}
      const raw = v.value !== undefined ? v.value : (v.default_value ?? '');
      env[key] = String(raw);
    }
    return env;
  } catch {
    return {};
  }
}

export function getPrimaryPort(portsJson: string): number | undefined {
  return getPrimaryExternalPort(portsJson);
}

export type ServerRuntimeConfig = Pick<
  ServerPageServer,
  | 'Cpu'
  | 'Memory'
  | 'Swap'
  | 'Ports'
  | 'StartCommand'
  | 'Storage'
  | 'Variables'
  | 'dockerImage'
  | 'node'
>;

export function buildServerRuntimeEnv(
  server: Pick<ServerRuntimeConfig, 'Cpu' | 'Memory' | 'Variables' | 'Ports'>,
  variables: string | null | ServerVariable[] = server.Variables,
): Record<string, string> {
  const ports = getPrimaryPort(server.Ports);
  const envVariables = buildEnvVariables(variables);
  envVariables['SERVER_PORT'] = String(ports ?? '');
  envVariables['SERVER_MEMORY'] = String(server.Memory);
  envVariables['SERVER_CPU'] = String(server.Cpu);
  return envVariables;
}

export function getConfiguredDockerImage(server: Pick<ServerRuntimeConfig, 'dockerImage'>): string | null {
  if (!server.dockerImage) {
    return null;
  }
  return String(Object.values(JSON.parse(server.dockerImage))[0]);
}

export async function stopServerContainer(
  server: Pick<ServerPageServer, 'node' | 'image'>,
  serverId: string,
  stopCommand = server.image?.stop || 'stop',
  options: { releaseResources?: boolean } = {},
): Promise<void> {
  const releaseResources = options.releaseResources !== false;
  emitRealtime(serverEvent('server.power.stop.started', serverId, { state: { stopCommand } }));
  try {
    await daemonRequest({
      method: 'POST',
      path: '/container/stop',
      nodeAddress: server.node.address,
      nodePort: server.node.port,
      nodeKey: server.node.key,
      body: {
        id: serverId,
        stopCmd: stopCommand,
      },
    });
  } catch (error) {
    emitRealtime(
      serverEvent('server.power.stop.failed', serverId, {
        error: { message: 'The daemon could not stop the server.', code: 'DAEMON_UNREACHABLE' },
      }),
    );
    throw error;
  }
  if (releaseResources) {
    // The container is down — free its reservation so stopped servers stop
    // consuming node capacity. Restart passes releaseResources:false to keep
    // the reservation held across the stop/start cycle.
    await prisma.server.update({ where: { UUID: serverId }, data: { Running: false } }).catch(() => {});
  }
  emitRealtime(serverEvent('server.power.stopped', serverId, { state: { running: false } }));
}

export async function startServerContainer(
  server: ServerRuntimeConfig & Pick<ServerPageServer, 'image'>,
  serverId: string,
  options: {
    dockerImage?: string;
    startCommand?: string;
    variables?: string | null | ServerVariable[];
    mounts?: { source: string; target: string; readOnly?: boolean }[];
  } = {},
): Promise<void> {
  const dockerImage = options.dockerImage ?? getConfiguredDockerImage(server);
  if (!dockerImage) {
    throw new Error('Docker image not found.');
  }

  // Runtime capacity gate: only running servers consume node capacity, so a
  // stopped server's resources are immediately available again. The starting
  // server is excluded so restart can keep its own reservation held.
  await assertNodeCapacity(
    server.node,
    server.Memory,
    server.Cpu,
    server.Storage,
    serverId,
    { runningOnly: true },
  );

  const mounts = options.mounts ?? await resolveServerMounts(serverId);

  let configFiles: unknown;
  if (server.image?.config_files) {
    try {
      configFiles = JSON.parse(server.image.config_files);
    } catch {
      configFiles = undefined;
    }
  }

  let startResponse;
  emitRealtime(serverEvent('server.power.start.started', serverId));
  try {
    startResponse = await daemonRequest({
      method: 'POST',
      path: '/container/start',
      nodeAddress: server.node.address,
      nodePort: server.node.port,
      nodeKey: server.node.key,
      body: {
        id: serverId,
        image: dockerImage,
        ports: portsToDaemonString(server.Ports),
        Memory: server.Memory,
        Swap: server.Swap ?? 0,
        Cpu: server.Cpu,
        Storage: server.Storage,
        env: buildServerRuntimeEnv(server, options.variables ?? server.Variables),
        StartCommand: options.startCommand ?? server.StartCommand,
        mounts,
        configFiles,
      },
    });
  } catch (error) {
    emitRealtime(
      serverEvent('server.power.start.failed', serverId, {
        error: { message: 'The daemon could not start the server.', code: 'DAEMON_UNREACHABLE' },
      }),
    );
    throw new Error('daemon is unreachable — is it running?', { cause: error });
  }

  if (startResponse.status >= 400) {
    const body =
      typeof startResponse.data === 'object' && startResponse.data !== null
        ? (startResponse.data as { error?: string; detail?: string })
        : {};
    const rawDetail = `${body.error ?? 'request failed'}${body.detail ? ` — ${  body.detail}` : ''}`;
    const failure = classifyDaemonStartFailure(rawDetail);
    emitRealtime(
      serverEvent('server.power.start.failed', serverId, {
        error: { message: failure.message, code: failure.code },
        state: { detail: rawDetail },
      }),
    );
    // The raw daemon detail remains in the log through Error.cause.
    throw failure;
  }

  // The container is up — the server now holds a reservation on its node.
  await prisma.server.update({ where: { UUID: serverId }, data: { Running: true } }).catch(() => {});
  emitRealtime(serverEvent('server.power.started', serverId, { state: { running: true } }));
}

async function resolveServerMounts(
  serverId: string,
): Promise<{ source: string; target: string; readOnly?: boolean }[] | undefined> {
  const serverMounts = await prisma.serverMount
    .findMany({
      where: { serverId },
      include: { mount: true },
    });
  if (serverMounts.length === 0) {return undefined;}
  return serverMounts.map((sm) => ({
    source: sm.mount.source,
    target: sm.mount.target,
    readOnly: sm.mount.readOnly,
  }));
}

export async function restartServerContainer(
  server: ServerRuntimeConfig & Pick<ServerPageServer, 'image'>,
  serverId: string,
  options: {
    dockerImage?: string;
    startCommand?: string;
    stopCommand?: string;
    variables?: string | null | ServerVariable[];
    mounts?: { source: string; target: string; readOnly?: boolean }[];
  } = {},
): Promise<void> {
  // releaseResources:false keeps the reservation held across the stop/start
  // cycle — a restart must not free the server's own reserved resources.
  await stopServerContainer(server, serverId, options.stopCommand, { releaseResources: false });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await startServerContainer(server, serverId, options);
}
