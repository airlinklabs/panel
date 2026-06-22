export interface AddonLifecycleHooks {
  onInstall?: () => Promise<void> | void;
  onEnable?: () => Promise<void> | void;
  onDisable?: () => Promise<void> | void;
  onUpdate?: (previousVersion: string) => Promise<void> | void;
  onUninstall?: () => Promise<void> | void;
}

export function createLifecycleHooks(
  logger: any,
  config: any,
  unregisterSidebar: () => void,
): AddonLifecycleHooks {
  return {
    onInstall: () => {
      logger.info('Modrinth addon installed');
    },

    onEnable: () => {
      logger.info('Modrinth addon enabled');
    },

    onDisable: () => {
      logger.info('Modrinth addon disabled');
      unregisterSidebar();
    },

    onUpdate: (previousVersion: string) => {
      logger.info(`Modrinth addon updated from ${previousVersion}`);
    },

    onUninstall: async () => {
      logger.info('Modrinth addon uninstalled');
      unregisterSidebar();
      await config.deleteAll();
    },
  };
}
