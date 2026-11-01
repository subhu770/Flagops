import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/utils";

// GET /api/projects - list all projects with environments
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        environments: {
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { flags: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - create new project with default environments
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slug } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Project name and slug are required" },
        { status: 400 }
      );
    }

    const cleanSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

    const existing = await prisma.project.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Project slug "${cleanSlug}" is already taken` },
        { status: 409 }
      );
    }

    // Create project along with standard environments: Production, Staging, Development
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        environments: {
          create: [
            {
              name: "Production",
              apiKey: generateApiKey("prod"),
            },
            {
              name: "Staging",
              apiKey: generateApiKey("stage"),
            },
            {
              name: "Development",
              apiKey: generateApiKey("dev"),
            },
          ],
        },
      },
      include: {
        environments: true,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
