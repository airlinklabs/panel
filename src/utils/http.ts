import { URL } from 'url';

export interface HttpError extends Error {
  status: number;
  statusText: string;
  body: unknown;
}

export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
}

function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && 'status' in error && 'body' in error;
}

function validateUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid URL: ${urlStr}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }
  return parsed;
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function buildBasicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  return response.text() as unknown as T;
}

async function request<T = unknown>(
  method: string,
  url: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    params?: Record<string, string | number | boolean | undefined>;
    auth?: { username: string; password: string };
    timeout?: number;
    responseType?: 'json' | 'text' | 'arraybuffer' | 'stream';
    signal?: AbortSignal;
  } = {},
): Promise<HttpResponse<T>> {
  const { body, headers: customHeaders, params, auth, timeout, signal } = options;

  validateUrl(url);

  const headers: Record<string, string> = {};

  if (auth) {
    headers['Authorization'] = buildBasicAuth(auth.username, auth.password);
  }

  if (body !== undefined && body !== null && options.responseType !== 'stream') {
    if (typeof body === 'string') {
      headers['Content-Type'] = 'text/plain';
    } else if (Buffer.isBuffer(body)) {
      // Don't set content type for buffers (likely form data streams)
    } else if (typeof body === 'object' && 'pipe' in (body as Record<string, unknown>)) {
      // Stream — don't set content type, let it be handled by caller
    } else {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  const finalUrl = params ? buildUrl(new URL(url).origin, new URL(url).pathname, params) : url;

  const controller = new AbortController();
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
      signal: signal ?? controller.signal,
    };

    if (body !== undefined && body !== null && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
      if (typeof body === 'string') {
        fetchOptions.body = body;
      } else if (Buffer.isBuffer(body)) {
        fetchOptions.body = body;
      } else if (typeof body === 'object' && 'pipe' in (body as Record<string, unknown>)) {
        fetchOptions.body = body as unknown as ReadableStream;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    const response = await fetch(finalUrl, fetchOptions);

    let data: T;
    if (options.responseType === 'stream') {
      // For stream responses, return the response body as a Node.js readable stream
      const nodeStream = await import('stream');
      const webStream = response.body;
      if (webStream) {
        const readable = new nodeStream.Readable({
          async read() {
            const reader = webStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                this.push(Buffer.from(value));
              }
              this.push(null);
            } catch (err) {
              this.destroy(err as Error);
            }
          },
        });
        data = readable as unknown as T;
      } else {
        data = null as T;
      }
    } else if (options.responseType === 'arraybuffer') {
      const buffer = Buffer.from(await response.arrayBuffer());
      data = buffer as unknown as T;
    } else if (options.responseType === 'text') {
      data = (await response.text()) as unknown as T;
    } else {
      data = await parseResponse<T>(response);
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const abortError = new Error(`Request timed out after ${timeout}ms`) as HttpError;
      abortError.status = 0;
      abortError.statusText = 'Timeout';
      abortError.body = null;
      throw abortError;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function httpGet<T = unknown>(
  url: string,
  options: Omit<Parameters<typeof request>[2], 'body'> = {},
): Promise<HttpResponse<T>> {
  return request<T>('GET', url, options);
}

export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<Parameters<typeof request>[2], 'body'> = {},
): Promise<HttpResponse<T>> {
  return request<T>('POST', url, { ...options, body });
}

export async function httpPut<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<Parameters<typeof request>[2], 'body'> = {},
): Promise<HttpResponse<T>> {
  return request<T>('PUT', url, { ...options, body });
}

export async function httpPatch<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<Parameters<typeof request>[2], 'body'> = {},
): Promise<HttpResponse<T>> {
  return request<T>('PATCH', url, { ...options, body });
}

export async function httpDelete<T = unknown>(
  url: string,
  options: Omit<Parameters<typeof request>[2], 'body'> = {},
): Promise<HttpResponse<T>> {
  return request<T>('DELETE', url, options);
}

export { isHttpError };
export type { HttpResponse as Response };
