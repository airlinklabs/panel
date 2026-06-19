// ── Daemon Client ──
// HTTP client for the panel's per-server daemon.
// Handles file upload, delete, mkdir, list, and server status.
// Uses path sanitization and typed responses.

import type { AddonLogger, AddonServerData } from '../types/panel';
import type { AddonSecurity } from '../types/panel';
import type { AddonServerPort } from '../types/panel';
import { PROJECT_TYPE_DIRS, type ProjectType } from '../types/modrinth';

interface DaemonClientOptions {
  host: string;
  port: number;
  token: string;
  useHttps?: boolean;
}

interface DaemonResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface ServerInfo {
  running: boolean;
  uptime?: number;
  [key: string]: unknown;
}

export class DaemonClient {
  private logger: AddonLogger;
  private security: AddonSecurity;
  private baseUrl: string;
  private token: string;

  constructor(logger: AddonLogger, security: AddonSecurity) {
    this.logger = logger;
    this.security = security;
    this.baseUrl = '';
    this.token = '';
  }

  /**
   * Initialize the client for a specific server's daemon.
   */
  configure(server: AddonServerData): void {
    if (!server.node) {
      throw new Error('Server has no associated node');
    }
    const protocol = server.node.port === 443 ? 'https' : 'http';
    this.baseUrl = `${protocol}://${server.node.address}:${server.node.port}`;
    this.token = server.node.key;
  }

  /**
   * Upload a file to the server via the daemon.
   * Sanitizes the destination path to prevent directory traversal.
   */
  async uploadFile(
    serverUUID: string,
    destinationPath: string,
    fileBuffer: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<DaemonResponse> {
    // Sanitize the destination path
    const sanitized = this.security.sanitizePath('/', destinationPath);
    if (sanitized === null) {
      return { success: false, error: 'Invalid file path: directory traversal detected' };
    }

    const base64Data = fileBuffer.toString('base64');

    return this.request('POST', `/api/client/servers/${serverUUID}/fs/upload`, {
      path: destinationPath,
      data: base64Data,
      contentType,
    });
  }

  /**
   * Delete a file from the server.
   * Sanitizes the path to prevent directory traversal.
   */
  async deleteFile(serverUUID: string, filePath: string): Promise<DaemonResponse> {
    const sanitized = this.security.sanitizePath('/', filePath);
    if (sanitized === null) {
      return { success: false, error: 'Invalid file path: directory traversal detected' };
    }

    return this.request('DELETE', `/api/client/servers/${serverUUID}/fs/delete`, {
      path: filePath,
    });
  }

  /**
   * Create a directory on the server.
   * Sanitizes the path to prevent directory traversal.
   */
  async mkdir(serverUUID: string, dirPath: string): Promise<DaemonResponse> {
    const sanitized = this.security.sanitizePath('/', dirPath);
    if (sanitized === null) {
      return { success: false, error: 'Invalid directory path: directory traversal detected' };
    }

    return this.request('POST', `/api/client/servers/${serverUUID}/fs/mkdir`, {
      path: dirPath,
    });
  }

  /**
   * List files in a directory on the server.
   * Sanitizes the path to prevent directory traversal.
   */
  async listFiles(serverUUID: string, dirPath: string): Promise<DaemonResponse & { files?: FileEntry[] }> {
    const sanitized = this.security.sanitizePath('/', dirPath);
    if (sanitized === null) {
      return { success: false, error: 'Invalid directory path: directory traversal detected' };
    }

    return this.request('POST', `/api/client/servers/${serverUUID}/fs/list`, {
      path: dirPath,
    }) as Promise<DaemonResponse & { files?: FileEntry[] }>;
  }

  /**
   * Send a command to the server console.
   */
  async sendCommand(serverUUID: string, command: string): Promise<DaemonResponse> {
    return this.request('POST', `/api/client/servers/${serverUUID}/command`, {
      command,
    });
  }

  /**
   * Get server info (running state, etc.).
   */
  async getServerInfo(serverUUID: string): Promise<DaemonResponse & { info?: ServerInfo }> {
    return this.request('GET', `/api/client/servers/${serverUUID}`) as Promise<DaemonResponse & { info?: ServerInfo }>;
  }

  /**
   * Check if the daemon is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/api/client/health`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Make an HTTP request to the daemon.
   */
  private async request(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<DaemonResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const options: RequestInit = {
        method,
        headers: this.getHeaders(),
        signal: controller.signal,
      };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      clearTimeout(timeout);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Daemon request timed out' };
      }
      return { success: false, error: error.message || 'Daemon request failed' };
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'User-Agent': 'AirLink-ModrinthAddon/3.0.0',
    };
  }

  /**
   * Get the destination directory for a project type.
   */
  static getDestinationDir(projectType: ProjectType): string {
    return PROJECT_TYPE_DIRS[projectType] ?? 'mods';
  }
}
