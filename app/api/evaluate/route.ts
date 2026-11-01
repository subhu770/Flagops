import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  calculateRolloutBucket,
  matchesSegmentRule,
  UserSegmentRule,
  UserContext,
} from "@/lib/evaluation/engine";

// Evaluate condition against user context
function matchesSegment(segment: UserSegmentRule, user: Record<string, unknown>): boolean {
  return matchesSegmentRule(segment, { userId: String(user.key || user.userId || "anonymous"), attributes: user });
}

// POST /api/evaluate - evaluate flag(s) for a given user context
export async function POST(request: Request) {
  try {
    const apiKey =
      request.headers.get("x-environment-key") ||
      request.headers.get("authorization")?.replace("Bearer ", "") ||
      new URL(request.url).searchParams.get("apiKey");

    if (!apiKey) {
      return NextResponse.json(
        { error: "Environment API Key is required via 'x-environment-key' header or '?apiKey=' query param" },
        { status: 401 }
      );
    }

    const environment = await prisma.environment.findUnique({
      where: { apiKey },
      include: {
        project: {
          include: {
            flags: {
              include: {
                targetingRules: {
                  where: { environment: { apiKey } },
                },
              },
            },
          },
        },
      },
    });

    if (!environment) {
      return NextResponse.json(
        { error: "Invalid Environment API key" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { flagKey, user = { key: "anonymous" } } = body;
    const userKey = String(user.key ?? "anonymous");

    // Helper to evaluate a single flag
    const evaluateFlag = (flag: (typeof environment.project.flags)[0]) => {
      const rule = flag.targetingRules[0];

      if (!rule || !rule.enabled) {
        return {
          key: flag.key,
          enabled: false,
          value: flag.defaultValue,
          reason: "RULE_DISABLED",
        };
      }

      // Check user segments if any
      const segments = (rule.userSegments as unknown as UserSegmentRule[]) || [];
      if (segments.length > 0) {
        const anyMatch = segments.some((seg) => matchesSegment(seg, user));
        if (!anyMatch) {
          return {
            key: flag.key,
            enabled: false,
            value: flag.defaultValue,
            reason: "USER_SEGMENT_MISMATCH",
          };
        }
      }

      // Check percentage rollout with deterministic MurmurHash3
      const bucket = calculateRolloutBucket(flag.key, userKey);
      const inRollout = bucket < rule.rolloutPercentage;

      return {
        key: flag.key,
        enabled: inRollout,
        value: flag.defaultValue,
        bucket,
        rolloutPercentage: rule.rolloutPercentage,
        reason: inRollout ? "ROLLOUT_MATCH" : "ROLLOUT_EXCLUDED",
      };
    };

    if (flagKey) {
      const targetFlag = environment.project.flags.find((f) => f.key === flagKey);
      if (!targetFlag) {
        return NextResponse.json(
          { error: `Flag "${flagKey}" not found in this project` },
          { status: 404 }
        );
      }
      return NextResponse.json(evaluateFlag(targetFlag));
    }

    // Return all flags evaluated for this user
    const results: Record<string, unknown> = {};
    for (const flag of environment.project.flags) {
      results[flag.key] = evaluateFlag(flag);
    }

    return NextResponse.json({
      environment: environment.name,
      userKey,
      flags: results,
    });
  } catch (error) {
    console.error("Evaluation error:", error);
    return NextResponse.json(
      { error: "Evaluation engine encountered an error" },
      { status: 500 }
    );
  }
}
