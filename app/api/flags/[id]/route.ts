import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sseManager } from "@/lib/sse/manager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/flags/[id]
export async function GET(
  _request: Request,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const flag = await prisma.featureFlag.findUnique({
      where: { id },
      include: {
        project: true,
        targetingRules: {
          include: { environment: true },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!flag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    return NextResponse.json(flag);
  } catch (error) {
    console.error("Failed to fetch flag:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flag" },
      { status: 500 }
    );
  }
}

// PATCH /api/flags/[id] - update description, defaultValue
export async function PATCH(
  request: Request,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { description, defaultValue, modifiedBy = "dashboard.user@flagops.io" } = body;

    const currentFlag = await prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!currentFlag) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const flag = await tx.featureFlag.update({
        where: { id },
        data: {
          description: description !== undefined ? description : currentFlag.description,
          defaultValue: defaultValue !== undefined ? defaultValue : currentFlag.defaultValue,
        },
        include: {
          targetingRules: {
            include: { environment: true },
          },
          auditLogs: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          flagId: id,
          modifiedBy,
          diff: {
            action: "FLAG_METADATA_UPDATED",
            changes: {
              description: description !== undefined ? { before: currentFlag.description, after: description } : undefined,
              defaultValue: defaultValue !== undefined ? { before: currentFlag.defaultValue, after: defaultValue } : undefined,
            },
          },
        },
      });

      return flag;
    });

    // Broadcast update to all project environments
    const envs = await prisma.environment.findMany({
      where: { projectId: updated.projectId },
      select: { apiKey: true },
    });
    for (const env of envs) {
      sseManager.broadcastFlagUpdate({
        action: "FLAG_UPDATED",
        flagKey: updated.key,
        flagId: updated.id,
        envKey: env.apiKey,
        flag: {
          id: updated.id,
          key: updated.key,
          defaultValue: updated.defaultValue,
          flagType: updated.flagType,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update flag:", error);
    return NextResponse.json(
      { error: "Failed to update feature flag" },
      { status: 500 }
    );
  }
}

// DELETE /api/flags/[id]
export async function DELETE(
  _request: Request,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const existing = await prisma.featureFlag.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    await prisma.featureFlag.delete({
      where: { id },
    });

    // Broadcast deletion to all project environments
    const envs = await prisma.environment.findMany({
      where: { projectId: existing.projectId },
      select: { apiKey: true },
    });
    for (const env of envs) {
      sseManager.broadcastFlagUpdate({
        action: "FLAG_DELETED",
        flagKey: existing.key,
        flagId: existing.id,
        envKey: env.apiKey,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, deletedKey: existing.key });
  } catch (error) {
    console.error("Failed to delete flag:", error);
    return NextResponse.json(
      { error: "Failed to delete feature flag" },
      { status: 500 }
    );
  }
}
