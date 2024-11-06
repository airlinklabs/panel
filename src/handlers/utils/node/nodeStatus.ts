import axios from 'axios';

export async function checkNodeStatus(node: any) {
  try {
    const requestData = {
      method: 'get',
      url: 'http://' + node.address + ':' + node.port,
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
    node.status = 'Offline';
    return node;
  }
}
