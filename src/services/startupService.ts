import prisma from '../db';
import { validateVariableRules } from '../modules/user/server/startup';
import type { ServerVariable } from '../modules/user/server/shared';

/**
 * Parse dockerImage JSON from a server record, returning the first value or null.
 */
function parseDockerImage(raw: unknown): string | null {
  try {
    const d = (raw && typeof raw === 'object' ? raw : {}) as Record<
      string,
      string
    >;
    return (Object.values(d)[0] as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse Variables JSON from a server record into an array.
 */
function parseVariables(raw: unknown): ServerVariable[] {
  try {
    const parsed = raw ?? [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface StartupData {
  startCommand: string | null;
  dockerImage: string | null;
  variables: ServerVariable[];
}

/**
 * Get startup config for a server (by UUID).
 */
export async function getStartup(
  serverId: string,
): Promise<StartupData | null> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { image: true },
  });
  if (!server) {
    return null;
  }

  return {
    startCommand: server.StartCommand,
    dockerImage: parseDockerImage(server.dockerImage),
    variables: parseVariables(server.Variables),
  };
}

export interface UpdateStartupInput {
  startCommand?: string;
  dockerImage?: string;
  variables?: ServerVariable[];
}

/**
 * Update startup config for a server (by UUID).
 * Validates docker image against allowed list and variables against stored rules.
 * Returns { error, fields? } on validation failure, or null on success.
 */
export async function updateStartup(
  serverId: string,
  data: UpdateStartupInput,
): Promise<{
  error: string;
  fields?: { key: string; error: string }[];
} | null> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true, image: true },
  });
  if (!server) {
    return { error: 'Server not found' };
  }

  const updateData: Record<string, unknown> = {};

  if (data.startCommand !== undefined) {
    updateData.StartCommand = data.startCommand;
  }

  if (data.dockerImage !== undefined) {
    let valid = false;
    let imageObj: Record<string, string> = {};
    try {
      const arr = server.image?.dockerImages;
      if (Array.isArray(arr)) {
        for (const obj of arr) {
          const record = obj as Record<string, string>;
          for (const key of Object.keys(record)) {
            if (key === data.dockerImage) {
              valid = true;
              imageObj = { [key]: String(record[key]) };
            }
          }
        }
      }
    } catch {
      // invalid docker images config
    }
    if (!valid) {
      return { error: 'Invalid Docker image selected' };
    }
    updateData.dockerImage = imageObj;
  }

  if (data.variables !== undefined) {
    if (!Array.isArray(data.variables)) {
      return { error: 'Variables must be an array' };
    }

    let defs: { env?: string; rules?: string; rulesMessage?: string }[];
    try {
      defs = (server.Variables ?? []) as {
        env?: string;
        rules?: string;
        rulesMessage?: string;
      }[];
    } catch {
      defs = [];
    }
    const defByEnv = new Map(defs.map((d) => [d.env, d]));

    for (const v of data.variables) {
      const def = defByEnv.get(String(v.env));
      const rulesSource = def
        ? { ...def, name: def.env, env: def.env, ...(v as object) }
        : v;
      const err = validateVariableRules(
        rulesSource as ServerVariable,
        String(v.value ?? ''),
      );
      if (err) {
        return {
          error: 'Variable validation failed.',
          fields: [{ key: String(v.env), error: err }],
        };
      }
    }
    updateData.Variables = data.variables;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.server.update({ where: { UUID: serverId }, data: updateData });
  }

  return null;
}
