import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FlagType } from "@prisma/client";
import { sseManager } from "@/lib/sse/manager";

// GET /api/flags?projectId=...&environmentId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const environmentId = searchParams.get("environmentId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId query param is required" },
        { status: 400 }
      );
    }

    const flags = await prisma.featureFlag.findMany({
      where: { projectId },
      include: {
        targetingRules: {
          where: environmentId ? { environmentId } : undefined,
          include: {
            environment: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(flags);
  } catch (error) {
    console.error("Failed to fetch flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}

// POST /api/flags - create feature flag + initial targeting rules for all environments
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, key, description, flagType, defaultValue, initialEnabled = false } = body;

    if (!projectId || !key) {
      return NextResponse.json(
        { error: "projectId and flag key are required" },
        { status: 400 }
      );
    }

    const cleanKey = key
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");

    // Check key collision in this project
    const existing = await prisma.featureFlag.findUnique({
      where: {
        projectId_key: {
          projectId,
          key: cleanKey,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Feature flag key "${cleanKey}" already exists in this project.` },
        { status: 409 }
      );
    }

    // Get all environments for this project
    const environments = await prisma.environment.findMany({
      where: { projectId },
    });

    // Validate flagType
    const validTypes = Object.values(FlagType);
    const validatedType = validTypes.includes(flagType) ? (flagType as FlagType) : FlagType.BOOLEAN;

    // Create flag and targeting rules in transaction
    const newFlag = await prisma.$transaction(async (tx) => {
      const flag = await tx.featureFlag.create({
        data: {
          projectId,
          key: cleanKey,
          description: description?.trim() || null,
          flagType: validatedType,
          defaultValue: defaultValue !== undefined ? defaultValue : (validatedType === FlagType.BOOLEAN ? false : ""),
        },
      });

      // Create targeting rule for each environment
      if (environments.length > 0) {
        await tx.targetingRule.createMany({
          data: environments.map((env) => ({
            flagId: flag.id,
            environmentId: env.id,
            enabled: env.name.toLowerCase().includes("dev") ? true : initialEnabled,
            rolloutPercentage: env.name.toLowerCase().includes("dev") ? 100 : (initialEnabled ? 100 : 0),
            userSegments: [],
          })),
        });
      }

      // Initial audit log
      await tx.auditLog.create({
        data: {
          flagId: flag.id,
          modifiedBy: "dashboard.user@flagops.io",
          diff: {
            action: "FLAG_CREATED",
            key: cleanKey,
            type: validatedType,
            environmentsConfigured: environments.length,
          },
        },
      });

      return flag;
    });

    const fullFlag = await prisma.featureFlag.findUnique({
      where: { id: newFlag.id },
      include: {
        targetingRules: {
          include: { environment: true },
        },
        auditLogs: true,
      },
    });

    // Broadcast newly created flag to all environment clients in this project
    if (fullFlag && fullFlag.targetingRules) {
      for (const rule of fullFlag.targetingRules) {
        sseManager.broadcastFlagUpdate({
          action: "FLAG_CREATED",
          flagKey: fullFlag.key,
          flagId: fullFlag.id,
          environmentId: rule.environmentId,
          envKey: rule.environment.apiKey,
          rule: {
            id: rule.id,
            enabled: rule.enabled,
            rolloutPercentage: rule.rolloutPercentage,
            userSegments: rule.userSegments,
          },
          flag: {
            id: fullFlag.id,
            key: fullFlag.key,
            defaultValue: fullFlag.defaultValue,
            flagType: fullFlag.flagType,
          },
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json(fullFlag, { status: 201 });
  } catch (error) {
    console.error("Failed to create feature flag:", error);
    return NextResponse.json(
      { error: "Failed to create feature flag" },
      { status: 500 }
    );
  }
}
