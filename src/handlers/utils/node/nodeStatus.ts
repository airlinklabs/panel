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
    };

    const response = await axios(requestData);
    const { versionFamily, versionRelease, status, remote } = response.data;

    node.status = status;
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;

    return node;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      node.status = 'Offline';
      node.error = error.response?.data?.message || 'Unknown error';
    } else {
      node.status = 'Offline';
      node.error = 'An unexpected error occurred';
    }

    return node;
  }
}
