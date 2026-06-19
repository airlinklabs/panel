export interface ModrinthSettings {
  showWarningBanner: boolean;
  warningTitle: string;
  warningMessage: string;
  disabledProjectTypes: string[];
  blockedProjects: string[];
}

export const DEFAULT_SETTINGS: ModrinthSettings = {
  showWarningBanner: false,
  warningTitle: 'Notice',
  warningMessage: '',
  disabledProjectTypes: [],
  blockedProjects: [],
};
