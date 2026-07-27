import path from 'path';

/**
 * Sanitizes a file path to prevent path traversal attacks.
 * Rejects paths containing ".." segments or absolute paths that escape the base directory.
 * Returns null if the path is unsafe.
 */
export function sanitizePath(baseDir: string, userPath: string): string | null {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    return null;
  }

  // Reject null bytes
  if (userPath.includes('\0')) {
    return null;
  }

  // Normalize and resolve the path
  const normalized = path.normalize(userPath);
  const resolved = path.resolve(baseDir, normalized);

  // Check if the resolved path stays within baseDir
  const realBase = path.resolve(baseDir);
  if (resolved.startsWith(realBase + path.sep) || resolved === realBase) {
    return normalized;
  }

  return null;
}

/**
 * Validates that a path doesn't contain traversal sequences.
 * Use this for quick checks before forwarding paths to the daemon.
 */
export function isPathSafe(userPath: string): boolean {
  if (typeof userPath !== 'string') return false;
  if (userPath.includes('\0')) return false;
  if (userPath.includes('..')) return false;
  // Reject absolute paths
  if (path.isAbsolute(userPath)) return false;
  return true;
}

/**
 * Normalizes a path by collapsing multiple slashes and removing trailing slashes.
 */
export function normalizePath(userPath: string): string {
  return userPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}
