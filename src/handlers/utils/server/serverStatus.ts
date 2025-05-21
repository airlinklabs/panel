import axios from 'axios';
import logger from '../../logger';

// Declare global serverStoppingStates
declare global {
  var serverStoppingStates: {
    [key: string]: boolean;
  };
}

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

/**
 * Get the current status and uptime of a server
 * @param serverInfo Information about the server
 * @returns Server status including online state and uptime in seconds
 */
export async function getServerStatus(serverInfo: ServerInfo): Promise<ServerStatus> {
  try {
    const statusRequest = {
      method: 'GET',
      url: `http://${serverInfo.nodeAddress}:${serverInfo.nodePort}/container/status`,
      auth: {
        username: 'Airlink',
        password: serverInfo.nodeKey,
      },
      params: { id: serverInfo.serverUUID },
      timeout: 3000, // 3 second timeout
    };

    const response = await axios(statusRequest);
    const data = response.data;

    // Default status
    const status: ServerStatus = {
      online: false,
      starting: false,
      stopping: false,
      uptime: null,
      startedAt: null
    };

    // Check if the server is running
    if (data && data.running === true) {
      // Check if the server is in stopping state
      // This is determined by checking if a stop command was recently sent
      const cacheKey = `server_stopping_${serverInfo.serverUUID}`;
      if (global.serverStoppingStates && global.serverStoppingStates[cacheKey]) {
        // Server is in stopping state
        status.online = false;
        status.starting = false;
        status.stopping = true;
        return status;
      }

      // Check if the server is in starting state
      // This requires checking the logs for the startup_line regex
      try {
        // Get the server image info to check if it has a startup_line
        const imageInfoRequest = {
          method: 'GET',
          url: `http://${serverInfo.nodeAddress}:${serverInfo.nodePort}/container/image-info`,
          auth: {
            username: 'Airlink',
            password: serverInfo.nodeKey,
          },
          params: { id: serverInfo.serverUUID },
          timeout: 3000,
        };

        const imageInfoResponse = await axios(imageInfoRequest);
        const imageInfo = imageInfoResponse.data;

        // Check if the image has a startup_line
        if (imageInfo && imageInfo.startup_line && imageInfo.startup_line.regex) {
          // Get the container logs
          const logsRequest = {
            method: 'GET',
            url: `http://${serverInfo.nodeAddress}:${serverInfo.nodePort}/container/logs`,
            auth: {
              username: 'Airlink',
              password: serverInfo.nodeKey,
            },
            params: {
              id: serverInfo.serverUUID,
              tail: 100 // Get the last 100 lines
            },
            timeout: 3000,
          };

          const logsResponse = await axios(logsRequest);
          const logs = logsResponse.data;

          // Create a regex from the startup_line
          const startupRegex = new RegExp(imageInfo.startup_line.regex);

          // Check if the startup line is in the logs
          const startupLineFound = logs.split('\n').some((line: string) => startupRegex.test(line));

          if (startupLineFound) {
            // Server is fully started
            status.online = true;
            status.starting = false;
          } else {
            // Server is running but hasn't reached the startup line yet
            status.online = false;
            status.starting = true;
          }
        } else {
          // No startup_line in image info, consider it online
          status.online = true;
          status.starting = false;
        }
      } catch (imageError) {
        status.online = true;
        status.starting = false;
      }

      // If we have a start time, calculate uptime
      if (data.startedAt) {
        status.startedAt = data.startedAt;
        const startTime = new Date(data.startedAt).getTime();
        const currentTime = Date.now();
        status.uptime = Math.floor((currentTime - startTime) / 1000); // Convert to seconds
      }
    }

    return status;
  } catch (error: any) {
    // Silently handle connection errors - don't log to console
    // Just return an offline status

    // Default error status
    const errorStatus: ServerStatus = {
      online: false,
      starting: false,
      stopping: false,
      uptime: null,
      startedAt: null,
      daemonOffline: true
    };

    // Provide more detailed error information
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        errorStatus.error = 'Connection refused - daemon may be offline';
      } else if (error.code === 'ETIMEDOUT') {
        errorStatus.error = 'Connection timed out';
      } else if (error.code === 'ENOTFOUND') {
        errorStatus.error = 'Host not found - check node address';
      } else if (error.response) {
        errorStatus.error = `Server responded with ${error.response.status}: ${error.response.statusText}`;
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
