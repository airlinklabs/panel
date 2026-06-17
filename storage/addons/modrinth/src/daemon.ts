import type { ServerData, ServerInfo } from './types';

interface DaemonRequestOptions {
  method: string;
  path: string;
  body?: any;
  token: string;
  host: string;
  port: number;
}

async function daemonRequest(opts: DaemonRequestOptions): Promise<any> {
  const url = `http://${opts.host}:${opts.port}${opts.path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${opts.token}`,
  };

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Daemon ${res.status}: ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

export async function getServerStatus(info: ServerInfo): Promise<any> {
  return daemonRequest({
    method: 'GET',
    path: '/api/server',
    token: info.daemonToken,
    host: info.host,
    port: info.port,
  });
}

export async function uploadFile(
  info: ServerInfo,
  serverUUID: string,
  filePath: string,
  fileBuffer: Buffer
): Promise<void> {
  const base64 = fileBuffer.toString('base64');
  await daemonRequest({
    method: 'POST',
    path: `/api/server/${serverUUID}/fs/upload`,
    body: { file: filePath, content: base64 },
    token: info.daemonToken,
    host: info.host,
    port: info.port,
  });
}

export async function deleteFile(info: ServerInfo, serverUUID: string, filePath: string): Promise<void> {
  await daemonRequest({
    method: 'DELETE',
    path: `/api/server/${serverUUID}/fs/delete`,
    body: { file: filePath },
    token: info.daemonToken,
    host: info.host,
    port: info.port,
  });
}

export async function createDirectory(info: ServerInfo, serverUUID: string, dirPath: string): Promise<void> {
  await daemonRequest({
    method: 'POST',
    path: `/api/server/${serverUUID}/fs/mkdir`,
    body: { file: dirPath },
    token: info.daemonToken,
    host: info.host,
    port: info.port,
  });
}

export async function directoryExists(info: ServerInfo, serverUUID: string, dirPath: string): Promise<boolean> {
  try {
    const res = await daemonRequest({
      method: 'GET',
      path: `/api/server/${serverUUID}/fs/list?file=${encodeURIComponent(dirPath)}`,
      token: info.daemonToken,
      host: info.host,
      port: info.port,
    });
    return Array.isArray(res);
  } catch {
    return false;
  }
}

export async function sendServerCommand(
  info: ServerInfo,
  serverUUID: string,
  command: string
): Promise<void> {
  await daemonRequest({
    method: 'POST',
    path: `/api/server/${serverUUID}/command`,
    body: { command },
    token: info.daemonToken,
    host: info.host,
    port: info.port,
  });
}

export function getServerInfo(server: ServerData): ServerInfo | null {
  if (!server.Ports) return null;
  const ports = server.Ports.split(',').map(Number);
  const hostPort = ports[0];
  if (!hostPort) return null;

  return {
    host: process.env.NODE_HOST || '127.0.0.1',
    port: hostPort,
    daemonToken: process.env.NODE_TOKEN || '',
  };
}

export function getDestinationDir(projectType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (projectType === 'mod' || ext === 'jar') return 'mods';
  if (projectType === 'plugin') return 'plugins';
  if (projectType === 'resourcepack') return 'resourcepacks';
  if (projectType === 'shader') return 'shaderpacks';
  if (projectType === 'datapack') {
    if (fileName.includes('/')) return 'datapacks';
    return 'datapacks';
  }
  if (ext === 'zip') return 'mods';
  return 'mods';
}

export function sanitizePath(filePath: string): string {
  return filePath
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._/\-]/g, '_');
}
