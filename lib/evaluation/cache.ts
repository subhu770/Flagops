/**
 * In-Memory Low-Latency Environment Flag Cache
 * 
 * Minimizes database queries by caching compiled flag rules in RAM.
 * Automatically invalidated when targeted invalidation payloads arrive.
 */

import { FeatureFlagSnapshot, TargetingRuleSnapshot } from "./engine";

export interface CachedEnvironmentData {
  environmentId: string;
  environmentName: string;
  projectName: string;
  flags: Array<{
    flag: FeatureFlagSnapshot;
    rule?: TargetingRuleSnapshot;
  }>;
  cachedAt: number;
}

export class EnvironmentRulesCache {
  private cache = new Map<string, CachedEnvironmentData>();
  private readonly defaultTtlMs = 60 * 1000; // 60 seconds TTL

  public get(envKey: string): CachedEnvironmentData | null {
    const entry = this.cache.get(envKey);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > this.defaultTtlMs) {
      this.cache.delete(envKey);
      return null;
    }

    return entry;
  }

  public set(envKey: string, data: Omit<CachedEnvironmentData, "cachedAt">): void {
    this.cache.set(envKey, {
      ...data,
      cachedAt: Date.now(),
    });
  }

  public invalidate(envKey: string): void {
    this.cache.delete(envKey);
  }

  public invalidateAll(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

const globalForCache = globalThis as unknown as {
  flagOpsRulesCache?: EnvironmentRulesCache;
};

export const rulesCache =
  globalForCache.flagOpsRulesCache ?? new EnvironmentRulesCache();

if (process.env.NODE_ENV !== "production") {
  globalForCache.flagOpsRulesCache = rulesCache;
}

export default rulesCache;
