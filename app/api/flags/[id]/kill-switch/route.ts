import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sseManager } from "@/lib/sse/manager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/flags/[id]/kill-switch
export async function POST(
  request: Request,
  { params }: RouteParams
) {
  try {
    const { id: flagId } = await params;
    const body = await request.json();
    const {
      environmentId,
      reason = "Emergency manual kill switch triggered",
      modifiedBy = "oncall.engineer@flagops.io",
    } = body;

    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // If environmentId is specified, disable for that environment.
      // If not, kill across all environments!
      if (environmentId) {
        const env = await tx.environment.findUnique({
          where: { id: environmentId },
        });

        await tx.targetingRule.upsert({
          where: {
            flagId_environmentId: {
              flagId,
              environmentId,
            },
          },
          create: {
            flagId,
            environmentId,
            enabled: false,
            rolloutPercentage: 0,
            userSegments: [],
          },
          update: {
            enabled: false,
            rolloutPercentage: 0,
          },
        });

        await tx.auditLog.create({
          data: {
            flagId,
            modifiedBy,
            diff: {
              action: "KILL_SWITCH_ENGAGED",
              environment: env?.name ?? environmentId,
              environmentId,
              reason,
              timestamp: new Date().toISOString(),
            },
          },
        });

        return { success: true, flagKey: flag.key, environmentApiKey: env?.apiKey };
      } else {
        // Kill switch for all environments
        await tx.targetingRule.updateMany({
          where: { flagId },
          data: {
            enabled: false,
            rolloutPercentage: 0,
          },
        });

        await tx.auditLog.create({
          data: {
            flagId,
            modifiedBy,
            diff: {
              action: "GLOBAL_KILL_SWITCH_ENGAGED",
              reason,
              timestamp: new Date().toISOString(),
            },
          },
        });

        const envs = await tx.environment.findMany({
          where: { projectId: flag.projectId },
          select: { apiKey: true, id: true },
        });

        return { success: true, flagKey: flag.key, allEnvKeys: envs.map((e) => e.apiKey) };
      }
    });

    // Broadcast SSE invalidation event
    if (result.environmentApiKey) {
      sseManager.broadcastFlagUpdate({
        action: "KILL_SWITCH_ENGAGED",
        flagKey: flag.key,
        flagId,
        environmentId,
        envKey: result.environmentApiKey,
        rule: { enabled: false, rolloutPercentage: 0, userSegments: [] },
        updatedAt: new Date().toISOString(),
      });
    } else if (result.allEnvKeys) {
      for (const envKey of result.allEnvKeys) {
        sseManager.broadcastFlagUpdate({
          action: "KILL_SWITCH_ENGAGED",
          flagKey: flag.key,
          flagId,
          envKey,
          rule: { enabled: false, rolloutPercentage: 0, userSegments: [] },
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Kill switch error:", error);
    return NextResponse.json(
      { error: "Failed to engage kill switch" },
      { status: 500 }
    );
  }
}
