/**
 * Resolve a server's docker image reference.
 *
 * Rows carry either the legacy object form `{"mc":"itzg/minecraft-server"}`
 * (first value wins) or a plain image reference written directly by seeds and
 * older flows — both must resolve without throwing. `undefined` means "let
 * the daemon fall back to its configured default".
 */
export function parseDockerImageRef(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'object') {
    const first = Object.values(value as Record<string, unknown>)[0];
    return typeof first === 'string' && first ? first : undefined;
  }
  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const first = Object.values(parsed as Record<string, unknown>)[0];
      return typeof first === 'string' && first ? first : undefined;
    }
    if (typeof parsed === 'string' && parsed) {
      return parsed;
    }
  } catch {
    // not JSON — plain image reference
  }
  return raw;
}
