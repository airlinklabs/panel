import axios from 'axios';
import { daemonSchemeSync } from '../core/daemonRequest';

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

    console.log('[DEBUG] Checking node:', {
      address: node.address,
      port: node.port,
      url
    });

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

    console.log('[DEBUG] Raw response data:', response.data);

    const { versionFamily, versionRelease, status, remote } = response.data;

    console.log('[DEBUG] Parsed response:', {
      status,
      versionFamily,
      versionRelease,
      remote
    });

    const finalStatus = status || 'Online';

    console.log('[DEBUG] Status decision:', {
      incomingStatus: status,
      fallbackUsed: !status,
      finalStatus
    });

    node.status = finalStatus;
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.error = undefined;

    console.log('[DEBUG] Final node object:', node);

    return node;
  } catch (error) {
    console.log('[DEBUG] Request failed for node:', {
      address: node.address,
      port: node.port,
      error
    });

    node.status = 'Offline';

    if (axios.isAxiosError(error)) {
      console.log('[DEBUG] Axios error details:', {
        code: error.code,
        message: error.message,
        responseData: error.response?.data
      });

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
      console.log('[DEBUG] Unknown error type:', error);
      node.error = 'An unexpected error occurred';
    }

    console.log('[DEBUG] Final node after error:', node);

    return node;
  }
}