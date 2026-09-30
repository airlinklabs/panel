const MIN_PORT = 1;
const MAX_PORT = 65535;

export interface ServerPortAssignment {
  name: string;
  internalPort: number;
  externalPort: number;
  primary: boolean;
}

export interface ServerPortRecord {
  Port?: string | number;
  name?: string;
  internalPort?: number | string;
  externalPort?: number | string;
  primary?: boolean;
}

export interface ImagePortRequirement {
  name: string;
  internalPort: number;
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

/**
 * Accepts both shapes: native Prisma `Json` values (arrays/objects) and JSON
 * strings. Callers still hand us encoded strings in a few places (legacy rows,
 * hand-built payloads), and those used to parse to `[]` and silently drop
 * every port.
 */
function toJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseImagePortRequirements(
  raw: unknown,
): ImagePortRequirement[] {
  try {
    const arr = toJsonArray(raw);
    if (!arr.length) {
      return [];
    }
    return arr
      .map((entry, index) => {
        const port = (entry ?? {}) as Record<string, unknown>;
        return {
          name: String(port.name || `Port ${index + 1}`),
          internalPort: Number(port.internalPort || port.port),
        };
      })
      .filter((port) => port.name.trim() && isValidPort(port.internalPort));
  } catch {
    return [];
  }
}

function isServerPortRecord(value: unknown): value is ServerPortRecord {
  return typeof value === 'object' && value !== null;
}

export function parseServerPorts(raw: unknown): ServerPortAssignment[] {
  try {
    const arr = toJsonArray(raw);
    if (!arr.length) {
      return [];
    }
    return arr
      .filter(isServerPortRecord)
      .map((port, index) => {
        const legacyParts =
          typeof port.Port === 'string' ? port.Port.split(':') : [];
        const externalPort = Number(
          port.externalPort ?? legacyParts[0] ?? port.Port,
        );
        const internalPort = Number(
          port.internalPort ?? legacyParts[1] ?? externalPort,
        );
        return {
          name: String(port.name || `Port ${index + 1}`),
          internalPort,
          externalPort,
          primary: Boolean(port.primary || index === 0),
        };
      })
      .filter(
        (port) =>
          isValidPort(port.internalPort) && isValidPort(port.externalPort),
      );
  } catch {
    return [];
  }
}

export function normalizeServerPorts(raw: unknown): ServerPortAssignment[] {
  const input = Array.isArray(raw) ? raw : [];
  return input.map((port, index) => ({
    name: String(port?.name || `Port ${index + 1}`).trim(),
    internalPort: Number(port?.internalPort),
    externalPort: Number(port?.externalPort),
    primary: Boolean(port?.primary || index === 0),
  }));
}

export function serializeServerPorts(
  ports: ServerPortAssignment[],
): Record<string, unknown>[] {
  return ports.map((port, index) => ({
    name: port.name || `Port ${index + 1}`,
    internalPort: port.internalPort,
    externalPort: port.externalPort,
    Port: `${port.externalPort}:${port.internalPort}`,
    primary: index === 0 ? true : Boolean(port.primary),
  }));
}

export function portsToDaemonString(raw: unknown): string {
  return parseServerPorts(raw)
    .map((port) => `${port.externalPort}:${port.internalPort}`)
    .join(',');
}

export function getPrimaryExternalPort(raw: unknown): number | undefined {
  const ports = parseServerPorts(raw);
  return (ports.find((port) => port.primary) ?? ports[0])?.externalPort;
}

export function getUsedExternalPorts(servers: { Ports: unknown }[]): number[] {
  return servers.flatMap((server) =>
    parseServerPorts(server.Ports).map((port) => port.externalPort),
  );
}

// Pick `count` free external ports at random from the node pool. Deterministic
// lowest-first picking makes the same ports hot spots; randomizing spreads new
// servers across the pool.
export function pickRandomFreePorts(
  pool: number[],
  usedPorts: number[],
  count: number,
): number[] {
  const used = new Set(usedPorts);
  const remaining = new Set(pool.filter((port) => !used.has(port)));
  const out: number[] = [];
  while (out.length < count && remaining.size > 0) {
    const arr = Array.from(remaining);
    const pick = arr[Math.floor(Math.random() * arr.length)];
    if (pick === undefined) {
      break;
    }
    out.push(pick);
    remaining.delete(pick);
  }
  return out;
}

export function validatePortAssignments(
  ports: ServerPortAssignment[],
  allocatedPorts: number[],
  usedPorts: number[],
  minimumCount: number,
): string | null {
  if (ports.length < minimumCount) {
    return `At least ${minimumCount} port(s) are required.`;
  }
  const seen = new Set<number>();
  for (const port of ports) {
    if (!port.name.trim()) {
      return 'Each port needs a name.';
    }
    if (!isValidPort(port.internalPort)) {
      return `Internal port ${port.internalPort} is invalid.`;
    }
    if (!isValidPort(port.externalPort)) {
      return `External port ${port.externalPort} is invalid.`;
    }
    if (!allocatedPorts.includes(port.externalPort)) {
      return `Port ${port.externalPort} is not allocated to the selected node.`;
    }
    if (usedPorts.includes(port.externalPort)) {
      return `Port ${port.externalPort} is already in use.`;
    }
    if (seen.has(port.externalPort)) {
      return `Port ${port.externalPort} was selected more than once.`;
    }
    seen.add(port.externalPort);
  }
  return null;
}
