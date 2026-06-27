const SAFE_ADDRESS = /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/;

export function buildDaemonUrl(
  scheme: 'http' | 'https' | 'ws' | 'wss',
  address: string,
  port: number,
  path: string,
): string {
  if (!SAFE_ADDRESS.test(address)) {
    throw new Error(`Daemon address failed safety check: ${address}`);
  }
  if (port < 1025 || port > 65535) {
    throw new Error(`Daemon port out of range: ${port}`);
  }
  const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${scheme}://${address}:${port}${sanitizedPath}`;
}
