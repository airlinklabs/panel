import { randomUUID } from "node:crypto";
import { z } from "zod";
import logger from "../logger";
import { getRedisClient } from "../redis";

// Real-time event bus — publishes structured events on authoritative state changes.
// Clients use monotonic seq for reconnect resync; payloads validated with zod at publish time.
// Redis pub/sub enables multi-instance event broadcasting.

export const REALTIME_EVENT_VERSION = 1;

export const realtimeResourceTypeSchema = z.enum([
  "server",
  "node",
  "user",
  "account",
  "backup",
  "image",
  "database",
  "activity",
  "addon",
  "settings",
  "system",
]);

export type RealtimeResourceType = z.infer<typeof realtimeResourceTypeSchema>;

export const realtimeScopeSchema = z
  .object({
    /** Deliver only to users who can access this server. */
    serverId: z.string().optional(),
    /** Deliver only to this user id. */
    userId: z.number().optional(),
    /** Deliver only to admins. */
    admin: z.boolean().optional(),
    /** Deliver to every authenticated socket (subject to role filters). */
    all: z.boolean().optional(),
  })
  .optional()
  .default({});

export type RealtimeScope = z.infer<typeof realtimeScopeSchema>;

export const realtimeEventSchema = z.object({
  type: z.string().min(1).max(128),
  version: z.literal(REALTIME_EVENT_VERSION).default(REALTIME_EVENT_VERSION),
  seq: z.number().int().nonnegative().optional(),
  timestamp: z.number().int().optional(),
  resource: z
    .object({
      type: realtimeResourceTypeSchema,
      id: z.union([z.string(), z.number()]),
    })
    .optional(),
  operationId: z.string().optional(),
  actorId: z.number().optional(),
  requestId: z.string().optional(),
  scope: realtimeScopeSchema,
  state: z.unknown().optional(),
  previous: z.unknown().optional(),
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export type RealtimeEventInput = Omit<
  z.input<typeof realtimeEventSchema>,
  "version" | "seq" | "timestamp"
>;

export interface RealtimeEventEnvelope extends RealtimeEvent {
  type: string;
  seq: number;
}

export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return realtimeEventSchema.safeParse(value).success;
}

const subscribers = new Set<(event: RealtimeEventEnvelope) => void>();
const history: RealtimeEventEnvelope[] = [];
const HISTORY_LIMIT = 500;

// ── Redis pub/sub for multi-instance broadcasting ──────────────────────────
const PUBSUB_CHANNEL = "airlink:realtime:events";
let redisSub: ReturnType<typeof getRedisClient> | null = null;

function ensureRedisSubscriber(): void {
  if (redisSub) return;
  try {
    redisSub = getRedisClient().duplicate();
    redisSub.on("error", (err: Error) => {
      logger.warn("[realtime] Redis subscriber error", { error: err.message });
    });
    redisSub.subscribe(PUBSUB_CHANNEL);
    redisSub.on("message", (_ch: string, msg: string) => {
      try {
        const envelope = JSON.parse(msg) as RealtimeEventEnvelope;
        // Skip events originating from this process (already emitted locally)
        if (envelope.actorId === -1) return;
        // Assign a local sequence number for the in-process bus
        envelope.seq = ++sequence;
        history.push(envelope);
        if (history.length > HISTORY_LIMIT) history.shift();
        for (const handler of subscribers) {
          try {
            handler(envelope);
          } catch (error) {
            logger.warn("[realtime] subscriber error", {
              error: String(error),
            });
          }
        }
      } catch {
        // malformed message — ignore
      }
    });
  } catch (err) {
    logger.warn("[realtime] Redis pub/sub init failed", { error: String(err) });
  }
}

function publishToRedis(envelope: RealtimeEventEnvelope): void {
  try {
    const redis = getRedisClient();
    // Tag with actorId=-1 so other instances skip echo
    redis.publish(PUBSUB_CHANNEL, JSON.stringify({ ...envelope, actorId: -1 }));
  } catch {
    // Redis unavailable — local bus still works
  }
}

// Lazy-init: subscribe on first event publish
let pubsubInitialized = false;

let sequence = 0;

/** Number of events published in this process lifetime. */
export function currentSequence(): number {
  return sequence;
}

/** Subscribe to every published event. Returns an unsubscribe function. */
export function subscribeToRealtime(
  handler: (event: RealtimeEventEnvelope) => void,
): () => void {
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

/** Events newer than `sinceSeq` (inclusive), oldest first. */
export function realtimeEventsSince(sinceSeq: number): RealtimeEventEnvelope[] {
  if (!Number.isFinite(sinceSeq) || sinceSeq <= 0) {
    return history.slice();
  }
  return history.filter((e) => e.seq >= sinceSeq);
}

/** Most recent event seq, or 0 when nothing has been emitted. */
export function currentRealtimeCursor(): number {
  return sequence;
}

/** Events published since this socket's cursor, or the whole history when the
 * client has never synced before. Consumers reconcile state after reconnect. */
export function syncEventsForClient(sinceSeq: number | null): {
  cursor: number;
  events: RealtimeEventEnvelope[];
} {
  const cursor = currentRealtimeCursor();
  const events =
    sinceSeq === null || sinceSeq === undefined || sinceSeq === 0
      ? history.slice()
      : realtimeEventsSince(sinceSeq);
  return { cursor, events };
}

/**
 * Publish a realtime event. The bus never throws: invalid payloads are logged
 * and dropped so one bad caller cannot take down the realtime system.
 */
export function emitRealtime(
  input: RealtimeEventInput,
): RealtimeEventEnvelope | null {
  const parsed = realtimeEventSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn("[realtime] dropped invalid event", {
      details: JSON.stringify(parsed.error.flatten()),
    });
    return null;
  }

  const now = Date.now();
  const envelope: RealtimeEventEnvelope = {
    ...(parsed.data as RealtimeEvent),
    seq: 0,
    timestamp: now,
  };
  envelope.seq = ++sequence;

  history.push(envelope);
  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }

  for (const handler of subscribers) {
    try {
      handler(envelope);
    } catch (error) {
      logger.warn("[realtime] subscriber error", { error: String(error) });
    }
  }

  // Broadcast to other instances via Redis pub/sub (lazy init)
  if (!pubsubInitialized) {
    pubsubInitialized = true;
    ensureRedisSubscriber();
  }
  publishToRedis(envelope);

  return envelope;
}

export { randomUUID as realtimeId };

// Convenience: build a scoped event for a server.
export function serverEvent(
  type: string,
  serverId: string,
  extra: Omit<RealtimeEventInput, "type" | "scope" | "resource"> = {},
): RealtimeEventInput {
  return {
    type,
    resource: { type: "server", id: serverId },
    scope: { serverId },
    ...extra,
  };
}

export function userEvent(
  type: string,
  userId: number,
  extra: Omit<RealtimeEventInput, "type" | "scope" | "resource"> = {},
): RealtimeEventInput {
  return {
    type,
    resource: { type: "user", id: userId },
    scope: { userId },
    ...extra,
  };
}
