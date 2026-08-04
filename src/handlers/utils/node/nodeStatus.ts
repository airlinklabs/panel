import { isHttpError } from '../../../utils/http';
import { daemonRequest } from '../core/daemonRequest';
import logger from '../../logger';

const NODE_STATUS_TIMEOUT_MS = 3000;
const NODE_STATUS_ONLINE = 'Online';
const NODE_STATUS_OFFLINE = 'Offline';

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
    const response = await daemonRequest<DaemonStatusResponse>({
      nodeAddress: node.address,
      nodePort: node.port,
      nodeKey: node.key,
      method: 'GET',
      path: '/',
      timeout: NODE_STATUS_TIMEOUT_MS,
    });

    const { versionFamily, versionRelease, status, remote } = response.data;

    const finalStatus = status || NODE_STATUS_ONLINE;

    node.status = finalStatus;
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.error = undefined;

    return node;
  } catch (error) {
    node.status = NODE_STATUS_OFFLINE;

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
