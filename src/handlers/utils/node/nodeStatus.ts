import axios from 'axios';
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

export async function checkNodeStatus(node: Node): Promise<Node> {
  try {
    const url = `${daemonSchemeSync()}://${node.address}:${node.port}`;

    const requestData = {
      method: 'get',
      url,
      auth: {
        username: 'Airlink',
        password: node.key,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 3000,
    };

    const response = await axios(requestData);

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

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        node.error = 'Connection refused - daemon may be offline';
      } else if (error.code === 'ETIMEDOUT') {
        node.error = 'Connection timed out';
      } else if (error.code === 'ENOTFOUND') {
        node.error = 'Host not found - check address';
      } else {
        node.error = error.response?.data?.message || 'Connection failed';
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
