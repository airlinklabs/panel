export interface Ok<T> {
  ok: true;
  data: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
