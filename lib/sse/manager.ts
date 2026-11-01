/**
 * Real-Time Server-Sent Events (SSE) Lightweight Connection Manager
 * 
 * Manages active streaming clients per environment key and enables zero-latency
 * invalidation broadcasts whenever flags or targeting rules mutate in the dashboard.
 */

export interface SSEClient {
  id: string;
  envKey: string;
  send: (event: string, data: unknown) => void;
  sendComment?: (comment: string) => void;
  close: () => void;
  connectedAt: Date;
  lastPingAt?: Date;
}

export interface FlagUpdatePayload {
  action: "RULE_UPDATED" | "KILL_SWITCH_ENGAGED" | "FLAG_UPDATED" | "FLAG_CREATED" | "FLAG_DELETED";
  flagKey: string;
  flagId?: string;
  environmentId?: string;
  envKey: string;
  rule?: unknown;
  flag?: unknown;
  updatedAt: string;
  [key: string]: unknown;
}

export class SSEConnectionManager {
  // Map of envKey -> Map of clientId -> SSEClient
  private environments = new Map<string, Map<string, SSEClient>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();

    // Hook Redis Pub/Sub cross-instance fanout if Redis is configured
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initializeRedisSubscriber } = require("@/lib/redis");
      initializeRedisSubscriber((payload: FlagUpdatePayload) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { rulesCache } = require("@/lib/evaluation/cache");
          rulesCache.invalidate(payload.envKey);
        } catch {
          // ignore
        }
        this.broadcastToEnvironment(payload.envKey, "flag_update", payload);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Registers a new SSE client connection under an environment key.
   * Returns a cleanup function that automatically unregisters the client.
   */
  public addClient(envKey: string, client: SSEClient): () => void {
    if (!this.environments.has(envKey)) {
      this.environments.set(envKey, new Map());
    }

    const envClients = this.environments.get(envKey)!;
    envClients.set(client.id, client);

    // console.log(`[SSE Manager] Client ${client.id} connected to env: ${envKey} (Total in env: ${envClients.size})`);

    return () => {
      this.removeClient(envKey, client.id);
    };
  }

  /**
   * Unregisters an SSE client connection.
   */
  public removeClient(envKey: string, clientId: string): void {
    const envClients = this.environments.get(envKey);
    if (!envClients) return;

    const client = envClients.get(clientId);
    if (client) {
      envClients.delete(clientId);
      try {
        client.close();
      } catch {
        // already closed
      }
    }

    if (envClients.size === 0) {
      this.environments.delete(envKey);
    }

    // console.log(`[SSE Manager] Client ${clientId} disconnected from env: ${envKey}`);
  }

  /**
   * Broadcasts a custom event payload to all clients connected under a specific environment.
   * Returns the count of clients notified.
   */
  public broadcastToEnvironment(
    envKey: string,
    event: string,
    payload: unknown
  ): number {
    const envClients = this.environments.get(envKey);
    if (!envClients || envClients.size === 0) {
      return 0;
    }

    let notifiedCount = 0;
    const staleClientIds: string[] = [];

    envClients.forEach((client, id) => {
      try {
        client.send(event, payload);
        notifiedCount++;
      } catch (err) {
        console.error(`[SSE Manager] Error broadcasting to client ${id}:`, err);
        staleClientIds.push(id);
      }
    });

    // Clean up any failed connections
    for (const staleId of staleClientIds) {
      envClients.delete(staleId);
    }

    return notifiedCount;
  }

  /**
   * Targeted invalidation pusher.
   * Broadcasts an `event: flag_update` payload to all connected clients under that environment.
   */
  public broadcastFlagUpdate(payload: FlagUpdatePayload): number {
    try {
      // Invalidate server-side evaluation cache immediately
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { rulesCache } = require("@/lib/evaluation/cache");
      rulesCache.invalidate(payload.envKey);
    } catch {
      // ignore
    }

    // Publish to Redis cluster bus
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { publishFlagInvalidation } = require("@/lib/redis");
      publishFlagInvalidation(payload).catch(() => {});
    } catch {
      // ignore
    }

    return this.broadcastToEnvironment(payload.envKey, "flag_update", payload);
  }

  /**
   * Broadcasts to all connected clients across all environments (e.g. global kill switch)
   */
  public broadcastAll(event: string, payload: unknown): number {
    let totalNotified = 0;
    for (const [envKey] of this.environments) {
      totalNotified += this.broadcastToEnvironment(envKey, event, payload);
    }
    return totalNotified;
  }

  /**
   * Keep-alive ping mechanism. Pings active connections every 20 seconds.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      this.environments.forEach((clients, envKey) => {
        const staleIds: string[] = [];
        clients.forEach((client, id) => {
          try {
            if (client.sendComment) {
              client.sendComment("ping");
            } else {
              client.send("ping", { time: now.toISOString() });
            }
            client.lastPingAt = now;
          } catch {
            staleIds.push(id);
          }
        });

        for (const staleId of staleIds) {
          clients.delete(staleId);
        }
        if (clients.size === 0) {
          this.environments.delete(envKey);
        }
      });
    }, 20000);

    // Unref interval so it doesn't block Node.js process shutdown
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Metrics and diagnostics for live streaming status
   */
  public getMetrics() {
    let totalClients = 0;
    const envBreakdown: Record<string, number> = {};

    this.environments.forEach((clients, envKey) => {
      envBreakdown[envKey] = clients.size;
      totalClients += clients.size;
    });

    return {
      totalConnectedClients: totalClients,
      activeEnvironments: this.environments.size,
      envBreakdown,
    };
  }

  /**
   * Closes all connections and stops heartbeat (for graceful test/app shutdown)
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.environments.forEach((clients) => {
      clients.forEach((client) => {
        try {
          client.close();
        } catch {
          // ignore
        }
      });
    });
    this.environments.clear();
  }
}

// Global declaration to prevent multiple connection manager instances during Next.js hot reload
const globalForSSE = globalThis as unknown as {
  flagOpsSSEManager?: SSEConnectionManager;
};

export const sseManager =
  globalForSSE.flagOpsSSEManager ?? new SSEConnectionManager();

if (process.env.NODE_ENV !== "production") {
  globalForSSE.flagOpsSSEManager = sseManager;
}

export default sseManager;
