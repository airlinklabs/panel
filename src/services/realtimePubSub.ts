import { getRedisClient } from "../handlers/redis";
import type Redis from "ioredis";
import logger from "../handlers/logger";

const CHANNEL = "airlink:realtime";

let subscriber: Redis | null = null;

export function publishEvent(event: {
  type: string;
  serverId: string;
  data: unknown;
}): void {
  try {
    const redis = getRedisClient();
    redis.publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.warn("[realtime-pubsub] publish failed", { error: String(err) });
  }
}

export function subscribeToEvents(
  callback: (event: { type: string; serverId: string; data: unknown }) => void,
): () => void {
  try {
    if (!subscriber) {
      subscriber = getRedisClient().duplicate();
      subscriber.on("error", (err: Error) => {
        logger.warn("[realtime-pubsub] subscriber error", {
          error: err.message,
        });
      });
    }
    subscriber.subscribe(CHANNEL);
    const handler = (_channel: string, msg: string) => {
      try {
        callback(
          JSON.parse(msg) as { type: string; serverId: string; data: unknown },
        );
      } catch {
        // malformed message — ignore
      }
    };
    subscriber.on("message", handler);
    return () => {
      subscriber?.off("message", handler);
      subscriber?.unsubscribe(CHANNEL);
    };
  } catch (err) {
    logger.warn("[realtime-pubsub] subscribe failed", { error: String(err) });
    return () => {};
  }
}
