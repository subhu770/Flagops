/**
 * Redis Connection & Cross-Instance Pub/Sub Broadcast Bus
 * 
 * Enables multi-instance horizontal scaling:
 * When a flag or rule is modified in any dashboard instance, the invalidation
 * payload is published to Redis and fanned out to all connected SSE clients
 * across every server node in the cluster.
 * 
 * Graceful fallback: If REDIS_URL is not configured, FlagOps operates
 * in standalone high-performance in-memory mode seamlessly.
 */

import Redis from "ioredis";
import type { FlagUpdatePayload } from "./sse/manager";

const REDIS_CHANNEL = "flagops:events:invalidation";

interface RedisBusGlobal {
  publisher?: Redis | null;
  subscriber?: Redis | null;
  isInitialized?: boolean;
}

const globalForRedis = globalThis as unknown as RedisBusGlobal;

let publisher: Redis | null = globalForRedis.publisher ?? null;
let subscriber: Redis | null = globalForRedis.subscriber ?? null;

export function getRedisClients(): {
  publisher: Redis | null;
  subscriber: Redis | null;
  isAvailable: boolean;
} {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return { publisher: null, subscriber: null, isAvailable: false };
  }

  if (!publisher && !subscriber) {
    try {
      publisher = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          return Math.min(times * 200, 3000);
        },
        lazyConnect: true,
      });

      subscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          return Math.min(times * 200, 3000);
        },
        lazyConnect: true,
      });

      publisher.connect().catch(() => {
        // Silently handle if Redis is temporarily unreachable
      });

      subscriber.connect().catch(() => {
        // Silently handle if Redis is temporarily unreachable
      });

      if (process.env.NODE_ENV !== "production") {
        globalForRedis.publisher = publisher;
        globalForRedis.subscriber = subscriber;
      }
    } catch {
      publisher = null;
      subscriber = null;
    }
  }

  return {
    publisher,
    subscriber,
    isAvailable: Boolean(publisher && subscriber),
  };
}

/**
 * Initializes Redis Pub/Sub subscription for SSE cross-instance fan-out.
 */
export function initializeRedisSubscriber(
  onRemoteInvalidation: (payload: FlagUpdatePayload) => void
): void {
  const { subscriber, isAvailable } = getRedisClients();
  if (!isAvailable || !subscriber || globalForRedis.isInitialized) return;

  globalForRedis.isInitialized = true;

  subscriber.subscribe(REDIS_CHANNEL, (err) => {
    if (err) {
      console.warn("[Redis Bus] Subscription warning:", err.message);
    }
  });

  subscriber.on("message", (channel, message) => {
    if (channel === REDIS_CHANNEL) {
      try {
        const payload = JSON.parse(message) as FlagUpdatePayload;
        onRemoteInvalidation(payload);
      } catch (parseErr) {
        console.error("[Redis Bus] Failed to parse message:", parseErr);
      }
    }
  });
}

/**
 * Publishes flag invalidation to Redis channel so all cluster instances receive it.
 */
export async function publishFlagInvalidation(payload: FlagUpdatePayload): Promise<void> {
  const { publisher, isAvailable } = getRedisClients();
  if (!isAvailable || !publisher) return;

  try {
    await publisher.publish(REDIS_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    console.warn("[Redis Bus] Failed to publish invalidation:", err);
  }
}
