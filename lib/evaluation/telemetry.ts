/**
 * FlagOps High-Throughput Telemetry Engine
 * 
 * Tracks real-time evaluation hits, requests, cache hits, cache misses,
 * and maintains accurate rolling cache hit ratios.
 */

export interface TelemetryStats {
  totalRequests: number;
  evaluationHits: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatio: number; // 0.0 to 1.0
  uptimeSeconds: number;
}

export class EvaluationTelemetry {
  private totalRequests = 0;
  private totalEvaluationHits = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime = Date.now();

  /**
   * Records a batch or single evaluation execution.
   * 
   * @param flagEvaluationsCount Number of individual flags evaluated in this request
   * @param fromCache Whether the environment rules were retrieved from in-memory cache
   */
  public recordEvaluation(flagEvaluationsCount: number, fromCache: boolean): void {
    this.totalRequests++;
    this.totalEvaluationHits += Math.max(1, flagEvaluationsCount);

    if (fromCache) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * Retrieves live telemetry counters and calculated cache hit ratio.
   */
  public getStats(): TelemetryStats {
    const totalLookups = this.cacheHits + this.cacheMisses;
    const cacheHitRatio =
      totalLookups > 0 ? this.cacheHits / totalLookups : 1.0;

    return {
      totalRequests: this.totalRequests,
      evaluationHits: this.totalEvaluationHits,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRatio: parseFloat(cacheHitRatio.toFixed(4)),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Resets telemetry metrics (useful for testing or periodic rollups)
   */
  public reset(): void {
    this.totalRequests = 0;
    this.totalEvaluationHits = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// Global declaration to maintain telemetry across Next.js API reloads
const globalForTelemetry = globalThis as unknown as {
  flagOpsEvaluationTelemetry?: EvaluationTelemetry;
};

export const evaluationTelemetry =
  globalForTelemetry.flagOpsEvaluationTelemetry ?? new EvaluationTelemetry();

if (process.env.NODE_ENV !== "production") {
  globalForTelemetry.flagOpsEvaluationTelemetry = evaluationTelemetry;
}

export default evaluationTelemetry;
