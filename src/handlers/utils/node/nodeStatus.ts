import { isHttpError } from '../../../utils/http';
import { daemonInfoSchema, parseDaemonResponse } from '../../../platform/daemon/dtos';
import { daemonRequest } from '../core/daemonRequest';
import { cache } from '../../cache';
import logger from '../../logger';

const NODE_STATUS_TIMEOUT_MS = 3000;
const NODE_STATUS_ONLINE = 'Online';
const NODE_STATUS_OFFLINE = 'Offline';

/** Cache node health results for 15 seconds. */
const NODE_STATUS_CACHE_TTL = 15;

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

function nodeCacheKey(node: Node): string {
  return `node:status:${node.address}:${node.port}`;
}

export async function checkNodeStatus(node: Node): Promise<Node> {
  const cacheKey = nodeCacheKey(node);

  return cache.wrap(cacheKey, NODE_STATUS_CACHE_TTL, async () => {
    try {
      const response = await daemonRequest<unknown>({
        nodeAddress: node.address,
        nodePort: node.port,
        nodeKey: node.key,
        method: 'GET',
        path: '/',
        timeout: NODE_STATUS_TIMEOUT_MS,
      });

      const { versionFamily, versionRelease, status, remote } =
        parseDaemonResponse(daemonInfoSchema, response.data) ?? {};

      const finalStatus = status || NODE_STATUS_ONLINE;

      node.status = finalStatus;
      node.versionFamily = versionFamily as string | undefined;
      node.versionRelease = versionRelease as string | undefined;
      node.remote = remote as boolean | undefined;
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
  });
}

/**
 * Force-refresh node status, bypassing the cache.
 * Used by the admin test-node-connection endpoint.
 */
export async function checkNodeStatusUncached(node: Node): Promise<Node> {
  await cache.del(nodeCacheKey(node));
  return checkNodeStatus(node);
}
