export type InstallStage =
  | 'initializing'
  | 'downloading'
  | 'processing'
  | 'installing_mods'
  | 'installing_overrides'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ModProgress {
  name: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
}

export interface InstallProgress {
  serverId: string;
  projectId: string;
  projectName: string;
  stage: InstallStage;
  overall: number;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  currentMod: string;
  mods: ModProgress[];
  errors: string[];
  warnings: string[];
  startedAt: number;
}
