import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sseManager } from "@/lib/sse/manager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/flags/[id]/rules - update targeting rule for an environment
export async function PUT(
  request: Request,
  { params }: RouteParams
) {
  try {
    const { id: flagId } = await params;
    const body = await request.json();
    const {
      environmentId,
      enabled,
      rolloutPercentage,
      userSegments = [],
      modifiedBy = "dashboard.user@flagops.io",
    } = body;

    if (!environmentId) {
      return NextResponse.json(
        { error: "environmentId is required" },
        { status: 400 }
      );
    }

    // Validate flag and environment
    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      include: { project: true },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    });

    if (!environment) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }

    const clampedPercentage = Math.min(100, Math.max(0, Number(rolloutPercentage) || 0));

    // Get current rule to compute diff
    const currentRule = await prisma.targetingRule.findUnique({
      where: {
        flagId_environmentId: {
          flagId,
          environmentId,
        },
      },
    });

    // Upsert rule and record audit log
    const updatedRule = await prisma.$transaction(async (tx) => {
      const rule = await tx.targetingRule.upsert({
        where: {
          flagId_environmentId: {
            flagId,
            environmentId,
          },
        },
        create: {
          flagId,
          environmentId,
          enabled: Boolean(enabled),
          rolloutPercentage: clampedPercentage,
          userSegments,
        },
        update: {
          enabled: enabled !== undefined ? Boolean(enabled) : currentRule?.enabled ?? false,
          rolloutPercentage: clampedPercentage,
          userSegments,
        },
        include: {
          environment: true,
        },
      });

      // Create Audit Log record
      await tx.auditLog.create({
        data: {
          flagId,
          modifiedBy,
          diff: {
            action: "TARGETING_RULE_SAVED",
            environment: environment.name,
            environmentId,
            changes: {
              enabled: {
                before: currentRule?.enabled ?? false,
                after: rule.enabled,
              },
              rolloutPercentage: {
                before: currentRule?.rolloutPercentage ?? 0,
                after: rule.rolloutPercentage,
              },
              userSegments: {
                before: currentRule?.userSegments ?? [],
                after: rule.userSegments,
              },
            },
          },
        },
      });

      return rule;
    });

    // Push targeted invalidation payload (event: flag_update) to connected SSE clients under this environment
    sseManager.broadcastFlagUpdate({
      action: "RULE_UPDATED",
      flagKey: flag.key,
      flagId,
      environmentId,
      envKey: environment.apiKey,
      rule: {
        id: updatedRule.id,
        enabled: updatedRule.enabled,
        rolloutPercentage: updatedRule.rolloutPercentage,
        userSegments: updatedRule.userSegments,
      },
      flag: {
        id: flag.id,
        key: flag.key,
        defaultValue: flag.defaultValue,
        flagType: flag.flagType,
      },
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json(updatedRule);
  } catch (error) {
    console.error("Failed to update targeting rule:", error);
    return NextResponse.json(
      { error: "Failed to update targeting rule" },
      { status: 500 }
    );
  }
}
