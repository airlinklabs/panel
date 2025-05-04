import axios from 'axios';

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
    const requestData = {
      method: 'get',
      url: `http://${node.address}:${node.port}`,
      auth: {
        username: 'Airlink',
        password: node.key,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 3000, // Add timeout to prevent long waiting times
    };

    const response = await axios(requestData);
    const { versionFamily, versionRelease, status, remote } = response.data;

    node.status = status || 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.error = undefined;

    return node;
  } catch (error) {
    node.status = 'Offline';

    if (axios.isAxiosError(error)) {
      // Provide more detailed error information based on error code
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

    return node;
  }
}
