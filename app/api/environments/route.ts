import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/utils";

// GET /api/environments?projectId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const environments = await prisma.environment.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(environments);
  } catch (error) {
    console.error("Failed to fetch environments:", error);
    return NextResponse.json(
      { error: "Failed to fetch environments" },
      { status: 500 }
    );
  }
}

// POST /api/environments - create a new environment under a project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, name } = body;

    if (!projectId || !name) {
      return NextResponse.json(
        { error: "projectId and environment name are required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { flags: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const apiKey = generateApiKey(name);

    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: name.trim(),
        apiKey,
      },
    });

    // Create targeting rules for all existing flags in this project for the new environment
    if (project.flags.length > 0) {
      await prisma.targetingRule.createMany({
        data: project.flags.map((flag) => ({
          flagId: flag.id,
          environmentId: environment.id,
          enabled: false,
          rolloutPercentage: 0,
          userSegments: [],
        })),
      });
    }

    return NextResponse.json(environment, { status: 201 });
  } catch (error) {
    console.error("Failed to create environment:", error);
    return NextResponse.json(
      { error: "Failed to create environment" },
      { status: 500 }
    );
  }
}
