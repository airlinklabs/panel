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
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function parseImagePortRequirements(raw: string | null | undefined): ImagePortRequirement[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((port, index) => ({
        name: String(port?.name || `Port ${index + 1}`),
        internalPort: Number(port?.internalPort || port?.port),
      }))
      .filter((port) => port.name.trim() && isValidPort(port.internalPort));
  } catch {
    return [];
  }
}

export function parseServerPorts(raw: string | null | undefined): ServerPortAssignment[] {
  try {
    const parsed = JSON.parse(raw || '[]') as ServerPortRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((port, index) => {
        const legacyParts = typeof port.Port === 'string' ? port.Port.split(':') : [];
        const externalPort = Number(port.externalPort ?? legacyParts[0] ?? port.Port);
        const internalPort = Number(port.internalPort ?? legacyParts[1] ?? externalPort);
        return {
          name: String(port.name || `Port ${index + 1}`),
          internalPort,
          externalPort,
          primary: Boolean(port.primary || index === 0),
        };
      })
      .filter((port) => isValidPort(port.internalPort) && isValidPort(port.externalPort));
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

export function serializeServerPorts(ports: ServerPortAssignment[]): string {
  return JSON.stringify(ports.map((port, index) => ({
    name: port.name || `Port ${index + 1}`,
    internalPort: port.internalPort,
    externalPort: port.externalPort,
    Port: `${port.externalPort}:${port.internalPort}`,
    primary: index === 0 ? true : Boolean(port.primary),
  })));
}

export function portsToDaemonString(raw: string | null | undefined): string {
  return parseServerPorts(raw)
    .map((port) => `${port.externalPort}:${port.internalPort}`)
    .join(',');
}

export function getPrimaryExternalPort(raw: string | null | undefined): number | undefined {
  const ports = parseServerPorts(raw);
  return (ports.find((port) => port.primary) ?? ports[0])?.externalPort;
}

export function getUsedExternalPorts(servers: { Ports: string }[]): number[] {
  return servers.flatMap((server) => parseServerPorts(server.Ports).map((port) => port.externalPort));
}

export function validatePortAssignments(
  ports: ServerPortAssignment[],
  allocatedPorts: number[],
  usedPorts: number[],
  minimumCount: number,
): string | null {
  if (ports.length < minimumCount) return `At least ${minimumCount} port(s) are required.`;
  const seen = new Set<number>();
  for (const port of ports) {
    if (!port.name.trim()) return 'Each port needs a name.';
    if (!isValidPort(port.internalPort)) return `Internal port ${port.internalPort} is invalid.`;
    if (!isValidPort(port.externalPort)) return `External port ${port.externalPort} is invalid.`;
    if (!allocatedPorts.includes(port.externalPort)) return `Port ${port.externalPort} is not allocated to the selected node.`;
    if (usedPorts.includes(port.externalPort)) return `Port ${port.externalPort} is already in use.`;
    if (seen.has(port.externalPort)) return `Port ${port.externalPort} was selected more than once.`;
    seen.add(port.externalPort);
  }
  return null;
}
