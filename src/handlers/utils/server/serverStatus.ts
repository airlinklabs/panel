import axios from 'axios';
import { daemonSchemeSync } from '../core/daemonRequest';

interface ServerInfo {
  nodeAddress: string;
  nodePort: number;
  serverUUID: string;
  nodeKey: string;
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
    const response = await axios({
      method: 'GET',
      url: `${daemonSchemeSync()}://${serverInfo.nodeAddress}:${serverInfo.nodePort}/container/status`,
      auth: { username: 'Airlink', password: serverInfo.nodeKey },
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
  } catch (error: any) {
    const errorStatus: ServerStatus = {
      online: false,
      starting: false,
      stopping: false,
      uptime: null,
      startedAt: null,
      daemonOffline: true,
    };

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        errorStatus.error = 'Connection refused — daemon may be offline';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorStatus.error = 'Connection timed out';
        } else if (error.code === 'ENOTFOUND') {
        errorStatus.error = 'Host not found — check node address';
      } else if (error.response) {
        errorStatus.error = `Daemon responded with ${error.response.status}`;
        errorStatus.daemonOffline = false;
      } else {
        errorStatus.error = 'Connection failed';
      }
    } else {
      errorStatus.error = 'An unexpected error occurred';
    }

    return errorStatus;
  }
}
