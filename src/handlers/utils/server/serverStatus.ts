import { isHttpError } from '../../../utils/http';
import { daemonRequest } from '../core/daemonRequest';

interface ServerInfo {
  nodeAddress: string;
  nodePort: number;
  serverUUID: string;
  nodeKey: string;
}

interface DaemonStatusResponse {
  running?: boolean;
  startedAt?: string;
}

interface ServerStatus {
  online: boolean;
  starting: boolean;
  stopping: boolean;
  uptime: number | null;
  startedAt: string | null;
  error?: string;
  daemonOffline?: boolean;
}

export async function getServerStatus(serverInfo: ServerInfo): Promise<ServerStatus> {
  try {
    const response = await daemonRequest<DaemonStatusResponse>({
      nodeAddress: serverInfo.nodeAddress,
      nodePort: serverInfo.nodePort,
      nodeKey: serverInfo.nodeKey,
      method: 'GET',
      path: '/container/status',
      params: { id: serverInfo.serverUUID },
      timeout: 3000,
    });

    const data = response.data;
    const status: ServerStatus = {
      online: false,
      starting: false,
      stopping: false,
      uptime: null,
      startedAt: null,
    };

    if (data && data.running === true) {
      status.online = true;
      if (data.startedAt) {
        status.startedAt = data.startedAt;
        status.uptime = Math.floor((Date.now() - new Date(data.startedAt).getTime()) / 1000);
      }
    }

    return status;
  } catch (error: unknown) {
    const errorStatus: ServerStatus = {
      online: false,
      starting: false,
      stopping: false,
      uptime: null,
      startedAt: null,
      daemonOffline: true,
    };

    if (isHttpError(error)) {
      if (error.status === 0) {
        const code = (error as unknown as { code?: string }).code;
        if (code === 'ECONNREFUSED') {
          errorStatus.error = 'Connection refused — daemon may be offline';
        } else if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
          errorStatus.error = 'Connection timed out';
        } else if (code === 'ENOTFOUND') {
          errorStatus.error = 'Host not found — check node address';
        } else {
          errorStatus.error = 'Connection failed';
        }
      } else {
        errorStatus.error = `Daemon responded with ${error.status}`;
        errorStatus.daemonOffline = false;
      }
    } else {
      errorStatus.error = 'An unexpected error occurred';
    }

    return errorStatus;
  }
}
