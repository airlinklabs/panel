import { httpGet, isHttpError } from '../../../utils/http';
import { daemonSchemeSync } from '../core/daemonRequest';
import logger from '../../logger';

interface Node {
  address: string;
  port: number;
  key: string;
  status?: string;
  versionFamily?: string;
  versionRelease?: string;
  remote?: boolean;
  error?: string;
}

interface DaemonStatusResponse {
  versionFamily?: string;
  versionRelease?: string;
  status?: string;
  remote?: boolean;
}

export async function checkNodeStatus(node: Node): Promise<Node> {
  try {
    const url = `${daemonSchemeSync()}://${node.address}:${node.port}`;

    const response = await httpGet<DaemonStatusResponse>(url, {
      auth: {
        username: 'Airlink',
        password: node.key,
      },
      timeout: 3000,
    });

    const { versionFamily, versionRelease, status, remote } = response.data;

    const finalStatus = status || 'Online';

    node.status = finalStatus;
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.error = undefined;

    return node;
  } catch (error) {
    node.status = 'Offline';

    if (isHttpError(error)) {
      if (error.status === 0) {
        const code = (error as unknown as { code?: string }).code;
        if (code === 'ECONNREFUSED') {
          node.error = 'Connection refused - daemon may be offline';
        } else if (code === 'ETIMEDOUT') {
          node.error = 'Connection timed out';
        } else if (code === 'ENOTFOUND') {
          node.error = 'Host not found - check address';
        } else {
          node.error = ((error as unknown as { body?: { message?: string } }).body?.message) || 'Connection failed';
        }
      } else {
        node.error = ((error as unknown as { body?: { message?: string } }).body?.message) || 'Connection failed';
      }
    } else {
      node.error = 'An unexpected error occurred';
    }

    logger.warn('Node status check failed', {
      address: node.address,
      port: node.port,
      error: node.error,
    });

    return node;
  }
}
