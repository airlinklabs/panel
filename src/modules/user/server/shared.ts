import type { Request, Response } from 'express';
import type { Prisma, Users, settings as PanelSettings } from '../../../generated/prisma/client';
import prisma from '../../../db';
import { getParamAsString } from '../../../utils/typeHelpers';
import { daemonRequest, daemonSchemeSync } from '../../../handlers/utils/core/daemonRequest';
import { getPrimaryExternalPort, portsToDaemonString } from '../../../handlers/utils/server/ports';

declare global {
  var serverStoppingStates: { [key: string]: boolean };
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
    prisma.settings.findUnique({ where: { id: 1 } }),
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

export function getServerDaemonAddress(server: Pick<ServerPageServer, 'node'>, path: string): string {
  return `${daemonSchemeSync()}://${server.node.address}:${server.node.port}${path}`;
}

export function getServerDaemonAuth(server: Pick<ServerPageServer, 'node'>): { username: string; password: string } {
  return {
    username: 'Airlink',
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

export function getImageFeatures(image: any): string[] {
  if (!image) return [];
  try {
    const info = typeof image.info === 'string' ? JSON.parse(image.info) : image.info;
    return Array.isArray(info?.features) ? info.features : [];
  } catch {
    return [];
  }
}

export function buildEnvVariables(variables: string | null | ServerVariable[]): Record<string, string> {
  if (!variables) return {};
  try {
    const vars = Array.isArray(variables) ? variables : JSON.parse(variables) as any[];
    const env: Record<string, string> = {};
    for (const v of vars) {
      const key = v.env_variable || v.env;
      if (!key) continue;
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
): Promise<void> {
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
}

export async function startServerContainer(
  server: ServerRuntimeConfig,
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

  const mounts = options.mounts ?? await resolveServerMounts(serverId);

  await daemonRequest({
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
    },
  });
}

async function resolveServerMounts(
  serverId: string,
): Promise<{ source: string; target: string; readOnly?: boolean }[] | undefined> {
  const serverMounts = await prisma.serverMount
    .findMany({
      where: { serverId },
      include: { mount: true },
    })
    .catch(() => []);
  if (serverMounts.length === 0) return undefined;
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
  await stopServerContainer(server, serverId, options.stopCommand);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await startServerContainer(server, serverId, options);
}
