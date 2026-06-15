// ── Daemon API Response Types ────────────────────────────────────────────────
// These types define the contract between panel and daemon. All axios calls
// to daemon endpoints must use these types instead of `any`.

export interface DaemonContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  storageUsage: number;
}

export interface DaemonContainerState {
  running: boolean;
  state: string;
}

export interface DaemonInstallStatus {
  state: 'installing' | 'installed' | 'failed';
  message?: string;
}

export interface DaemonBackupResult {
  backup: {
    uuid: string;
    name: string;
    filePath: string;
    size: number;
    createdAt: string;
  };
}

export interface DaemonSftpCredential {
  username: string;
  password: string;
  port: number;
}

export interface DaemonSftpStatus {
  running: boolean;
  port: number;
}

export interface DaemonHostStats {
  cpu: number;
  memory: { total: number; used: number; free: number };
  uptime: number;
}

export interface DaemonStartResponse {
  message: string;
}

export interface DaemonStopResponse {
  message: string;
}

export interface DaemonCommandResponse {
  message: string;
}

export interface DaemonErrorResponse {
  error: string;
  code?: string;
}

export interface DaemonImage {
  id: number;
  name: string;
  description?: string;
  egg?: string;
  dockerImage?: string;
  startup?: string;
}
