/**
 * FlagOps High-Performance In-Memory Client SDK
 * 
 * Provides ultra-low latency, deterministic synchronous flag evaluations (<1ms)
 * with zero outbound network calls during evaluation.
 * 
 * Synchronizes with FlagOps SSE Streaming Engine for live invalidation updates.
 * Self-contained: Zero external runtime dependencies. Compatible with Node.js and Browser runtimes.
 */

export interface UserContext {
  userId: string;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export type SegmentOperator =
  | "EQUALS"
  | "equals"
  | "NOT_EQUALS"
  | "not_equals"
  | "IN_ARRAY"
  | "in_array"
  | "is_one_of"
  | "REGEX"
  | "regex"
  | "matches_regex"
  | "GREATER_THAN"
  | "greater_than"
  | "LESS_THAN"
  | "less_than"
  | "CONTAINS"
  | "contains"
  | "STARTS_WITH"
  | "starts_with"
  | "ENDS_WITH"
  | "ends_with";

export interface UserSegmentRule {
  id?: string;
  attribute: string;
  operator: SegmentOperator | string;
  value: unknown;
}

export interface TargetingRuleData {
  id?: string;
  enabled: boolean;
  rolloutPercentage: number;
  userSegments?: UserSegmentRule[];
}

export interface FlagData {
  id?: string;
  key: string;
  description?: string | null;
  flagType?: string;
  defaultValue: unknown;
  rule?: TargetingRuleData | null;
}

export interface EvaluationResult {
  enabled: boolean;
  value: unknown;
  matchedRuleId?: string;
  bucket?: number;
  reason: string;
}

export interface FlagUpdateEvent {
  action: "RULE_UPDATED" | "KILL_SWITCH_ENGAGED" | "FLAG_UPDATED" | "FLAG_CREATED" | "FLAG_DELETED" | string;
  flagKey: string;
  flagId?: string;
  environmentId?: string;
  envKey?: string;
  rule?: TargetingRuleData;
  flag?: Partial<FlagData>;
  updatedAt: string;
  [key: string]: unknown;
}

export interface FlagOpsClientOptions {
  /**
   * Base URL of the FlagOps dashboard/server (e.g., 'http://localhost:3000' or '' for relative window.location)
   */
  baseUrl?: string;

  /**
   * Automatically connect to SSE stream on construction (default: true)
   */
  autoConnectStream?: boolean;

  /**
   * Initial flags snapshot to bootstrap cache before first SSE or network fetch
   */
  initialFlags?: FlagData[];

  /**
   * Callback fired when flags are updated via live stream
   */
  onUpdate?: (event: FlagUpdateEvent) => void;

  /**
   * Callback fired when stream error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback fired when client is fully initialized with latest flags
   */
  onReady?: () => void;
}

// ==========================================
// In-Memory MurmurHash3 (32-bit x86) Engine
// ==========================================
function murmurHash3(key: string, seed: number = 0): number {
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  const bytes: number[] = [];
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      i++;
      const code2 = key.charCodeAt(i);
      const val = 0x10000 + (((code & 0x3ff) << 10) | (code2 & 0x3ff));
      bytes.push(
        0xf0 | (val >> 18),
        0x80 | ((val >> 12) & 0x3f),
        0x80 | ((val >> 6) & 0x3f),
        0x80 | (val & 0x3f)
      );
    }
  }

  const length = bytes.length;
  const nblocks = length >> 2;

  for (let i = 0; i < nblocks; i++) {
    const index = i << 2;
    let k1 =
      (bytes[index] & 0xff) |
      ((bytes[index + 1] & 0xff) << 8) |
      ((bytes[index + 2] & 0xff) << 16) |
      ((bytes[index + 3] & 0xff) << 24);

    k1 = Math.imul(k1, c1) >>> 0;
    k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
    k1 = Math.imul(k1, c2) >>> 0;

    h1 ^= k1;
    h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  let k1 = 0;
  const tailIndex = nblocks << 2;
  const remaining = length & 3;

  if (remaining === 3) k1 ^= (bytes[tailIndex + 2] & 0xff) << 16;
  if (remaining >= 2) k1 ^= (bytes[tailIndex + 1] & 0xff) << 8;
  if (remaining >= 1) {
    k1 ^= bytes[tailIndex] & 0xff;
    k1 = Math.imul(k1, c1) >>> 0;
    k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
    k1 = Math.imul(k1, c2) >>> 0;
    h1 ^= k1;
  }

  h1 ^= length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

function calculateBucket(flagKey: string, userId: string): number {
  return (murmurHash3(`${flagKey}:${userId}`) >>> 0) % 100;
}

// ==========================================
// Segment Attribute Matcher
// ==========================================
function evaluateSegment(rule: UserSegmentRule, user: UserContext): boolean {
  if (!rule || !rule.attribute) return true;

  let attrRaw: unknown = undefined;
  if (user.attributes && typeof user.attributes === "object") {
    attrRaw = (user.attributes as Record<string, unknown>)[rule.attribute];
  }
  if (attrRaw === undefined && user[rule.attribute] !== undefined) {
    attrRaw = user[rule.attribute];
  }
  if (attrRaw === undefined && rule.attribute === "userId") {
    attrRaw = user.userId;
  }

  const attrStr = attrRaw !== undefined && attrRaw !== null ? String(attrRaw).trim() : "";
  const ruleValRaw = rule.value;
  const ruleValStr = ruleValRaw !== undefined && ruleValRaw !== null ? String(ruleValRaw).trim() : "";

  const op = String(rule.operator || "").toUpperCase();

  switch (op) {
    case "EQUALS":
    case "EQUALS_TO": {
      if (typeof attrRaw === "boolean") {
        return attrRaw === (ruleValStr.toLowerCase() === "true");
      }
      if (typeof attrRaw === "number") {
        return attrRaw === Number(ruleValStr);
      }
      return attrStr.toLowerCase() === ruleValStr.toLowerCase();
    }

    case "NOT_EQUALS": {
      if (typeof attrRaw === "boolean") {
        return attrRaw !== (ruleValStr.toLowerCase() === "true");
      }
      if (typeof attrRaw === "number") {
        return attrRaw !== Number(ruleValStr);
      }
      return attrStr.toLowerCase() !== ruleValStr.toLowerCase();
    }

    case "IN_ARRAY":
    case "IS_ONE_OF": {
      let allowed: string[] = [];
      if (Array.isArray(ruleValRaw)) {
        allowed = ruleValRaw.map((s) => String(s).trim().toLowerCase());
      } else {
        allowed = ruleValStr
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
      }
      return allowed.includes(attrStr.toLowerCase());
    }

    case "REGEX":
    case "MATCHES_REGEX": {
      try {
        const regex = new RegExp(ruleValStr, "i");
        return regex.test(attrStr);
      } catch {
        return false;
      }
    }

    case "GREATER_THAN": {
      const numA = parseFloat(attrStr);
      const numB = parseFloat(ruleValStr);
      return !isNaN(numA) && !isNaN(numB) && numA > numB;
    }

    case "LESS_THAN": {
      const numA = parseFloat(attrStr);
      const numB = parseFloat(ruleValStr);
      return !isNaN(numA) && !isNaN(numB) && numA < numB;
    }

    case "CONTAINS": {
      return attrStr.toLowerCase().includes(ruleValStr.toLowerCase());
    }

    case "STARTS_WITH": {
      return attrStr.toLowerCase().startsWith(ruleValStr.toLowerCase());
    }

    case "ENDS_WITH": {
      return attrStr.toLowerCase().endsWith(ruleValStr.toLowerCase());
    }

    default:
      return true;
  }
}

// ==========================================
// FlagOps In-Memory Client Class
// ==========================================
export class FlagOpsClient {
  private readonly envKey: string;
  private readonly baseUrl: string;
  private readonly options: FlagOpsClientOptions;

  // In-memory local flag cache: Map<flagKey, FlagData>
  private flagsCache = new Map<string, FlagData>();

  private isReadyState = false;
  private readyPromise: Promise<void>;
  private readyResolver!: () => void;

  private isClosed = false;
  private abortController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  // Event listeners
  private listeners: {
    update: Set<(event: FlagUpdateEvent) => void>;
    ready: Set<() => void>;
    error: Set<(err: Error) => void>;
  } = {
    update: new Set(),
    ready: new Set(),
    error: new Set(),
  };

  constructor(envKey: string, options: FlagOpsClientOptions = {}) {
    if (!envKey) {
      throw new Error("[FlagOpsClient] envKey is required to initialize client");
    }

    this.envKey = envKey;
    this.options = options;
    this.baseUrl = (options.baseUrl || "").replace(/\/+$/, "");

    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolver = resolve;
    });

    if (options.onUpdate) this.on("update", options.onUpdate);
    if (options.onError) this.on("error", options.onError);
    if (options.onReady) this.on("ready", options.onReady);

    // Bootstrap initial flags if provided
    if (options.initialFlags && options.initialFlags.length > 0) {
      for (const flag of options.initialFlags) {
        this.flagsCache.set(flag.key, flag);
      }
      this.markReady();
    }

    // Auto connect to SSE stream
    if (options.autoConnectStream !== false) {
      this.connectStream();
    }
  }

  /**
   * Synchronous evaluation of a feature flag.
   * Resolves in under 1ms (microsecond execution) without making outbound network requests!
   * 
   * @param flagKey Unique flag key
   * @param userContext User identification context and targeting attributes
   * @returns boolean indicating whether the flag is active for this user
   */
  public isEnabled(flagKey: string, userContext: UserContext): boolean {
    const variation = this.getVariation(flagKey, userContext);
    return variation.enabled;
  }

  /**
   * Synchronous detailed variation evaluation.
   * Returns { enabled, value, matchedRuleId, bucket, reason }
   */
  public getVariation(
    flagKey: string,
    userContext: UserContext,
    defaultValue?: unknown
  ): EvaluationResult {
    const flag = this.flagsCache.get(flagKey);

    if (!flag) {
      return {
        enabled: false,
        value: defaultValue ?? null,
        reason: "FLAG_NOT_FOUND",
      };
    }

    const rule = flag.rule;
    const fallbackVal = defaultValue !== undefined ? defaultValue : flag.defaultValue;

    // 1. Check if rule is enabled
    if (!rule || !rule.enabled) {
      return {
        enabled: false,
        value: fallbackVal,
        matchedRuleId: rule?.id,
        reason: "RULE_DISABLED",
      };
    }

    // 2. Evaluate user segment conditions
    const segments = rule.userSegments || [];
    if (Array.isArray(segments) && segments.length > 0) {
      const matchAll = segments.every((seg) => evaluateSegment(seg, userContext));
      if (!matchAll) {
        return {
          enabled: false,
          value: fallbackVal,
          matchedRuleId: rule.id,
          reason: "USER_SEGMENT_MISMATCH",
        };
      }
    }

    // 3. Rollout percentage check
    const percentage = Math.min(100, Math.max(0, Number(rule.rolloutPercentage) || 0));

    if (percentage <= 0) {
      return {
        enabled: false,
        value: fallbackVal,
        matchedRuleId: rule.id,
        bucket: 0,
        reason: "ROLLOUT_EXCLUDED",
      };
    }

    if (percentage >= 100) {
      return {
        enabled: true,
        value: flag.defaultValue,
        matchedRuleId: rule.id,
        bucket: 0,
        reason: "ROLLOUT_MATCH",
      };
    }

    const userId = String(userContext.userId || userContext.userKey || userContext.id || "anonymous");
    const bucket = calculateBucket(flagKey, userId);
    const inRollout = bucket < percentage;

    return {
      enabled: inRollout,
      value: inRollout ? flag.defaultValue : fallbackVal,
      matchedRuleId: rule.id,
      bucket,
      reason: inRollout ? "ROLLOUT_MATCH" : "ROLLOUT_EXCLUDED",
    };
  }

  /**
   * Synchronous value getter with generic typing support.
   */
  public getValue<T>(flagKey: string, userContext: UserContext, fallback?: T): T {
    const variation = this.getVariation(flagKey, userContext, fallback);
    return variation.enabled ? (variation.value as T) : (fallback as T);
  }

  /**
   * Batch evaluates all cached flags for a given user context synchronously.
   */
  public getAllFlags(userContext: UserContext): Record<string, EvaluationResult> {
    const result: Record<string, EvaluationResult> = {};
    for (const [key] of this.flagsCache) {
      result[key] = this.getVariation(key, userContext);
    }
    return result;
  }

  /**
   * Returns a promise that resolves once the client has loaded its initial flag configuration.
   */
  public async waitForReady(timeoutMs: number = 5000): Promise<void> {
    if (this.isReadyState) return;

    return Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`[FlagOpsClient] waitForReady timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Checks if the client has loaded flags and is ready.
   */
  public isReady(): boolean {
    return this.isReadyState;
  }

  /**
   * Subscribes to client events: 'update' | 'ready' | 'error'
   */
  public on(
    event: "update",
    listener: (event: FlagUpdateEvent) => void
  ): () => void;
  public on(event: "ready", listener: () => void): () => void;
  public on(event: "error", listener: (err: Error) => void): () => void;
  public on(event: "update" | "ready" | "error", listener: any): () => void {
    if (this.listeners[event]) {
      this.listeners[event].add(listener);
    }
    return () => {
      this.listeners[event]?.delete(listener);
    };
  }

  /**
   * Disconnects from the SSE stream and stops background reconnection timers.
   */
  public close(): void {
    this.isClosed = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ==========================================
  // Private SSE Streaming Connection Logic
  // ==========================================
  private async connectStream(): Promise<void> {
    if (this.isClosed) return;

    this.abortController = new AbortController();
    const url = `${this.baseUrl}/api/v1/stream?envKey=${encodeURIComponent(this.envKey)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE stream connection failed with HTTP status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null, cannot read SSE stream");
      }

      this.reconnectAttempts = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (!this.isClosed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim() || block.startsWith(":")) continue;
          this.parseSSEBlock(block);
        }
      }
    } catch (err: unknown) {
      if (this.isClosed) return;

      const error = err instanceof Error ? err : new Error(String(err));
      // Ignore abort errors
      if (error.name !== "AbortError") {
        this.emitError(error);
        this.scheduleReconnect();
      }
    }
  }

  private parseSSEBlock(block: string): void {
    let eventType = "message";
    let dataStr = "";

    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith("data: ")) {
        dataStr = line.substring(6).trim();
      }
    }

    if (!dataStr) return;

    try {
      const payload = JSON.parse(dataStr);

      if (eventType === "initial_state") {
        // Initial snapshot payload
        if (Array.isArray(payload.flags)) {
          for (const item of payload.flags) {
            this.flagsCache.set(item.key, item);
          }
        }
        this.markReady();
      } else if (eventType === "flag_update") {
        this.handleFlagUpdate(payload);
      }
    } catch (parseErr) {
      console.error("[FlagOpsClient] Failed to parse SSE event data:", parseErr);
    }
  }

  private handleFlagUpdate(payload: FlagUpdateEvent): void {
    const { action, flagKey } = payload;
    if (!flagKey) return;

    if (action === "FLAG_DELETED") {
      this.flagsCache.delete(flagKey);
    } else {
      const existing = this.flagsCache.get(flagKey);

      if (existing) {
        if (payload.rule) {
          existing.rule = payload.rule;
        }
        if (payload.flag) {
          Object.assign(existing, payload.flag);
        }
        this.flagsCache.set(flagKey, existing);
      } else {
        // New flag or unknown flag
        this.flagsCache.set(flagKey, {
          key: flagKey,
          id: payload.flagId,
          defaultValue: payload.flag ? (payload.flag as FlagData).defaultValue : false,
          rule: payload.rule || null,
        });
      }
    }

    // Notify update listeners
    for (const listener of this.listeners.update) {
      try {
        listener(payload);
      } catch (err) {
        console.error("[FlagOpsClient] Error in update listener:", err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer) return;

    this.reconnectAttempts++;
    // Exponential backoff with jitter: 1s, 2s, 4s, 8s ... max 30s
    const delay = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectStream();
    }, delay);
  }

  private markReady(): void {
    if (this.isReadyState) return;
    this.isReadyState = true;
    this.readyResolver();

    for (const listener of this.listeners.ready) {
      try {
        listener();
      } catch (err) {
        console.error("[FlagOpsClient] Error in ready listener:", err);
      }
    }
  }

  private emitError(err: Error): void {
    for (const listener of this.listeners.error) {
      try {
        listener(err);
      } catch {
        // ignore
      }
    }
  }
}

export default FlagOpsClient;
