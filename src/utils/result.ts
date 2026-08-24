export interface Ok<T> { ok: true; data: T }
export interface Err<E> { ok: false; error: E }
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {return result.data;}
  if (result.error instanceof Error) {throw result.error;}
  throw new Error(String(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.data : defaultValue;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {return result;}
  return err(fn(result.error));
}

export function mapOk<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (!result.ok) {return result;}
  return ok(fn(result.data));
}
