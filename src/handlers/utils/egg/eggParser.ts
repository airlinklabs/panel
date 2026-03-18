export interface EggVariable {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  user_viewable: boolean;
  user_editable: boolean;
  rules: string;
  field_type: string;
}

export interface EggInstallScript {
  script: string;
  container: string;
  entrypoint: string;
}

export interface ParsedEgg {
  name: string;
  description: string;
  author: string;
  authorName: string;
  startup: string;
  stopCommand: string;
  startupDone: string;
  configFiles: string;
  dockerImages: Record<string, string>;
  variables: EggVariable[];
  installScript: EggInstallScript | null;
  features: string[];
  fileDenylist: string[];
  rawMeta: Record<string, unknown>;
}

export interface NormalizedImageData {
  name: string;
  description: string;
  author: string;
  authorName: string;
  startup: string;
  stop: string;
  startup_done: string;
  config_files: string;
  meta: string;
  dockerImages: string;
  info: string;
  scripts: string;
  variables: string;
}

export function isPterodactylEgg(data: Record<string, unknown>): boolean {
  const meta = data.meta as Record<string, unknown> | undefined;
  return !!(meta && meta.version === 'PTDL_v2');
}

export function parseEgg(raw: Record<string, unknown>): ParsedEgg {
  if (!isPterodactylEgg(raw)) {
    throw new Error('Not a valid Pterodactyl egg (expected meta.version = PTDL_v2)');
  }

  const dockerImagesRaw = raw.docker_images as Record<string, string> | undefined;
  const dockerImages: Record<string, string> = {};

  if (dockerImagesRaw && typeof dockerImagesRaw === 'object') {
    for (const [label, image] of Object.entries(dockerImagesRaw)) {
      if (typeof image === 'string') {
        dockerImages[label] = image;
      }
    }
  }

  const rawVariables = (raw.variables as unknown[]) || [];
  const variables: EggVariable[] = rawVariables
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      name: String(v.name ?? ''),
      description: String(v.description ?? ''),
      env_variable: String(v.env_variable ?? ''),
      default_value: String(v.default_value ?? ''),
      user_viewable: Boolean(v.user_viewable ?? true),
      user_editable: Boolean(v.user_editable ?? true),
      rules: String(v.rules ?? ''),
      field_type: String(v.field_type ?? 'text'),
    }));

  const scripts = (raw.scripts as Record<string, unknown>) || {};
  const installationRaw = scripts.installation as Record<string, unknown> | undefined;

  let installScript: EggInstallScript | null = null;
  if (installationRaw) {
    installScript = {
      script: String(installationRaw.script ?? ''),
      container: String(installationRaw.container ?? 'alpine:3.18'),
      entrypoint: String(installationRaw.entrypoint ?? 'bash'),
    };
  }

  const config = (raw.config as Record<string, unknown>) || {};
  const stopCommand = typeof config.stop === 'string' ? config.stop : 'stop';
  const startupDone = (() => {
    const startupConfig = config.startup as Record<string, unknown> | undefined;
    if (startupConfig && typeof startupConfig.done === 'string') {
      return startupConfig.done;
    }
    return '';
  })();

  const featuresRaw = (raw.features as string[]) || [];

  return {
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    author: String(raw.author ?? ''),
    authorName: String(raw.author ?? ''),
    startup: String(raw.startup ?? ''),
    stopCommand,
    startupDone,
    configFiles: typeof config.files === 'string' ? config.files : JSON.stringify(config.files ?? {}),
    dockerImages,
    variables,
    installScript,
    features: featuresRaw.filter((f) => typeof f === 'string'),
    fileDenylist: ((raw.file_denylist as string[]) || []).filter((f) => typeof f === 'string'),
    rawMeta: (raw.meta as Record<string, unknown>) || {},
  };
}

export function normalizeEggForDb(egg: ParsedEgg): NormalizedImageData {
  const dockerImagesArray = Object.entries(egg.dockerImages).map(([label, image]) => ({
    [label]: image,
  }));

  const scripts = egg.installScript
    ? {
        installation: {
          script: egg.installScript.script,
          container: egg.installScript.container,
          entrypoint: egg.installScript.entrypoint,
        },
      }
    : {};

  const info = {
    features: egg.features,
    file_denylist: egg.fileDenylist,
  };

  return {
    name: egg.name,
    description: egg.description,
    author: egg.author,
    authorName: egg.authorName,
    startup: egg.startup,
    stop: egg.stopCommand,
    startup_done: egg.startupDone,
    config_files: egg.configFiles,
    meta: JSON.stringify({ ...egg.rawMeta, source: 'pterodactyl' }),
    dockerImages: JSON.stringify(dockerImagesArray),
    info: JSON.stringify(info),
    scripts: JSON.stringify(scripts),
    variables: JSON.stringify(egg.variables),
  };
}

export function validateEggData(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name) errors.push('name is required');
  if (!data.startup) errors.push('startup command is required');

  if (isPterodactylEgg(data)) {
    if (!data.docker_images || typeof data.docker_images !== 'object') {
      errors.push('docker_images must be an object');
    }
  } else {
    if (!data.dockerImages && !data.docker_images) {
      errors.push('docker images are required');
    }
  }

  return { valid: errors.length === 0, errors };
}
