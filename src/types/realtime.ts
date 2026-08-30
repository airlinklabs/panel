/** Reference-counted handle returned by server watchers. Call `release()` when
 *  the caller no longer needs updates. Multiple watchers share one underlying
 *  daemon connection. */
export interface WatchHandle {
  release(): void;
  /** Current cached status, if the daemon has reported one. */
  snapshot?(): { status?: unknown; stats?: unknown } | null;
}
