const CSRF_COOKIE_NAME = "psifi.x-csrf-token";

export function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfTokenFromCookie();
  if (!token) return {};
  return {
    "csrf-token": token,
    "x-csrf-token": token,
  };
}

export async function csrfFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method?.toUpperCase() ?? "GET";

  // Only add CSRF headers for state-changing methods (not GET, HEAD, OPTIONS)
  const needsCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);

  const headers = new Headers(options.headers);
  if (needsCsrf) {
    const csrfHeaders = getCsrfHeaders();
    for (const [key, value] of Object.entries(csrfHeaders)) {
      headers.set(key, value);
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? "same-origin",
  });
}
