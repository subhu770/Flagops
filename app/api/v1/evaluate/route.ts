import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  evaluateFlag,
  evaluateBatchFlags,
  UserContext,
  FeatureFlagSnapshot,
  TargetingRuleSnapshot,
} from "@/lib/evaluation/engine";
import { evaluationTelemetry } from "@/lib/evaluation/telemetry";
import { rulesCache } from "@/lib/evaluation/cache";


/**
 * Helper to extract environment API key from request headers, params, or body
 */
function extractEnvKey(request: NextRequest, body?: Record<string, unknown>): string | null {
  const searchParams = request.nextUrl.searchParams;
  const headerKey =
    request.headers.get("x-environment-key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  const queryKey = searchParams.get("envKey") || searchParams.get("apiKey");
  const bodyKey = body && typeof body.envKey === "string" ? body.envKey : null;

  return (headerKey || queryKey || bodyKey || "").trim() || null;
}

/**
 * POST /api/v1/evaluate
 * 
 * High-throughput batch flag evaluation endpoint.
 * 
 * Input:
 * {
 *   "userId": "user_123",
 *   "attributes": {
 *     "country": "IN",
 *     "email": "alice@beta.com"
 *   }
 * }
 * 
 * Output:
 * Resolved dictionary:
 * {
 *   [flagKey: string]: {
 *     "enabled": boolean,
 *     "value": any,
 *     "matchedRuleId"?: string
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const startHr = process.hrtime();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const envKey = extractEnvKey(request, body);

    if (!envKey) {
      return NextResponse.json(
        {
          error: "Environment key is required via 'x-environment-key' header, '?envKey=' query param, or 'envKey' in body",
        },
        { status: 401 }
      );
    }

    // 1. Check in-memory compiled rules cache
    let cached = rulesCache.get(envKey);
    let fromCache = true;

    if (!cached) {
      fromCache = false;

      const environment = await prisma.environment.findUnique({
        where: { apiKey: envKey },
        include: {
          project: {
            include: {
              flags: {
                include: {
                  targetingRules: {
                    where: { environment: { apiKey: envKey } },
                  },
                },
              },
            },
          },
        },
      });

      if (!environment) {
        return NextResponse.json(
          { error: "Invalid environment API key" },
          { status: 403 }
        );
      }

      const flagsList = environment.project.flags.map((flag) => ({
        flag: {
          id: flag.id,
          key: flag.key,
          description: flag.description,
          flagType: flag.flagType,
          defaultValue: flag.defaultValue,
        } as FeatureFlagSnapshot,
        rule: flag.targetingRules[0]
          ? ({
              id: flag.targetingRules[0].id,
              flagId: flag.targetingRules[0].flagId,
              environmentId: flag.targetingRules[0].environmentId,
              enabled: flag.targetingRules[0].enabled,
              rolloutPercentage: flag.targetingRules[0].rolloutPercentage,
              userSegments: flag.targetingRules[0].userSegments,
            } as TargetingRuleSnapshot)
          : undefined,
      }));

      cached = {
        environmentId: environment.id,
        environmentName: environment.name,
        projectName: environment.project.name,
        flags: flagsList,
        cachedAt: Date.now(),
      };

      rulesCache.set(envKey, cached);
    }

    // 2. Parse User Context
    const rawUserId =
      body.userId || body.userKey || body.key || body.id || "anonymous";
    const userId = String(rawUserId).trim();

    let attributes: Record<string, unknown> = {};
    if (body.attributes && typeof body.attributes === "object") {
      attributes = body.attributes as Record<string, unknown>;
    } else if (body.user && typeof body.user === "object") {
      attributes = body.user as Record<string, unknown>;
    }

    const userContext: UserContext = {
      userId,
      attributes,
    };

    // 3. Evaluate Flags
    const targetFlagKey = (body.flagKey as string | undefined) || new URL(request.url).searchParams.get("flagKey");

    let resolvedDictionary: Record<
      string,
      {
        enabled: boolean;
        value: unknown;
        matchedRuleId?: string;
        bucket?: number;
        reason?: string;
        rolloutPercentage?: number;
      }
    > = {};

    if (targetFlagKey) {
      const match = cached.flags.find((item) => item.flag.key === targetFlagKey);
      if (!match) {
        return NextResponse.json(
          { error: `Feature flag "${targetFlagKey}" not found in this environment` },
          { status: 404 }
        );
      }
      const evalRes = evaluateFlag(match.flag, match.rule, userContext);
      resolvedDictionary[match.flag.key] = {
        enabled: evalRes.enabled,
        value: evalRes.value,
        matchedRuleId: evalRes.matchedRuleId,
        bucket: evalRes.bucket,
        reason: evalRes.reason,
        rolloutPercentage: match.rule?.rolloutPercentage ?? 100,
      };

      // Telemetry
      evaluationTelemetry.recordEvaluation(1, fromCache);
    } else {
      const batchResults = evaluateBatchFlags(cached.flags, userContext);
      for (const [key, res] of Object.entries(batchResults)) {
        const flagItem = cached.flags.find((f) => f.flag.key === key);
        resolvedDictionary[key] = {
          enabled: res.enabled,
          value: res.value,
          matchedRuleId: res.matchedRuleId,
          bucket: res.bucket,
          reason: res.reason,
          rolloutPercentage: flagItem?.rule?.rolloutPercentage ?? 100,
        };
      }

      // Telemetry: increment total flag evaluations and update cache hit ratio
      evaluationTelemetry.recordEvaluation(cached.flags.length, fromCache);
    }

    // Calculate latency in microseconds
    const diff = process.hrtime(startHr);
    const durationUs = Math.round(diff[0] * 1e6 + diff[1] / 1e3);

    const stats = evaluationTelemetry.getStats();

    return new NextResponse(JSON.stringify(resolvedDictionary), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "x-flagops-hits": String(stats.evaluationHits),
        "x-flagops-cache-hit-ratio": String(stats.cacheHitRatio),
        "x-flagops-duration-us": String(durationUs),
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      throw error;
    }
    console.error("[Evaluation API Error]:", error);
    return NextResponse.json(
      { error: "Internal evaluation engine error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/evaluate
 * Returns telemetry counters and system performance metrics.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const envKey = extractEnvKey(request);

  const stats = evaluationTelemetry.getStats();

  // If envKey is provided and client requests current rules snapshot
  if (envKey && searchParams.get("rules") === "true") {
    let cached = rulesCache.get(envKey);
    if (!cached) {
      const environment = await prisma.environment.findUnique({
        where: { apiKey: envKey },
        include: {
          project: {
            include: {
              flags: {
                include: {
                  targetingRules: {
                    where: { environment: { apiKey: envKey } },
                  },
                },
              },
            },
          },
        },
      });

      if (!environment) {
        return NextResponse.json({ error: "Invalid environment key" }, { status: 404 });
      }

      cached = {
        environmentId: environment.id,
        environmentName: environment.name,
        projectName: environment.project.name,
        flags: environment.project.flags.map((f) => ({
          flag: {
            id: f.id,
            key: f.key,
            description: f.description,
            flagType: f.flagType,
            defaultValue: f.defaultValue,
          },
          rule: f.targetingRules[0]
            ? {
                id: f.targetingRules[0].id,
                flagId: f.targetingRules[0].flagId,
                environmentId: f.targetingRules[0].environmentId,
                enabled: f.targetingRules[0].enabled,
                rolloutPercentage: f.targetingRules[0].rolloutPercentage,
                userSegments: f.targetingRules[0].userSegments,
              }
            : undefined,
        })),
        cachedAt: Date.now(),
      };
      rulesCache.set(envKey, cached);
    }

    return NextResponse.json({
      environment: cached.environmentName,
      flags: cached.flags,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    status: "healthy",
    engine: "MurmurHash3 (32-bit x86)",
    telemetry: stats,
    cacheEntries: rulesCache.size(),
    timestamp: new Date().toISOString(),
  });
}
