import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sseManager } from "@/lib/sse/manager";


/**
 * GET /api/v1/stream?envKey=flagops_env_...
 * 
 * Server-Sent Events (SSE) streaming endpoint for real-time flag invalidations.
 * Sets mandatory SSE headers:
 * - Content-Type: text/event-stream
 * - Cache-Control: no-cache
 * - Connection: keep-alive
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const envKey =
      searchParams.get("envKey") ||
      searchParams.get("apiKey") ||
      request.headers.get("x-environment-key") ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!envKey) {
      return new Response(
        JSON.stringify({
          error: "Environment key is required via ?envKey= query parameter or 'x-environment-key' header",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Authenticate and validate environment key against database
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
      return new Response(
        JSON.stringify({ error: "Invalid environment key" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const clientId = `sse_client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const encoder = new TextEncoder();

    let unregisterClient: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // 1. Send initial connection confirmation event
        const connectEvent = `event: connected\ndata: ${JSON.stringify({
          clientId,
          envKey,
          environment: environment.name,
          project: environment.project.name,
          connectedAt: new Date().toISOString(),
        })}\n\n`;
        controller.enqueue(encoder.encode(connectEvent));

        // 2. Send snapshot of current flag definitions and rules so client has instant local cache
        const initialFlags = environment.project.flags.map((flag) => {
          const rule = flag.targetingRules[0];
          return {
            id: flag.id,
            key: flag.key,
            description: flag.description,
            flagType: flag.flagType,
            defaultValue: flag.defaultValue,
            rule: rule
              ? {
                  id: rule.id,
                  enabled: rule.enabled,
                  rolloutPercentage: rule.rolloutPercentage,
                  userSegments: rule.userSegments,
                }
              : null,
          };
        });

        const snapshotEvent = `event: initial_state\ndata: ${JSON.stringify({
          envKey,
          environment: environment.name,
          flags: initialFlags,
          timestamp: new Date().toISOString(),
        })}\n\n`;
        controller.enqueue(encoder.encode(snapshotEvent));

        // 3. Register client in SSE Connection Manager
        unregisterClient = sseManager.addClient(envKey, {
          id: clientId,
          envKey,
          connectedAt: new Date(),
          send(event, data) {
            try {
              const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            } catch (err) {
              console.error(`[SSE Stream] Failed to push to client ${clientId}:`, err);
            }
          },
          sendComment(comment) {
            try {
              controller.enqueue(encoder.encode(`: ${comment}\n\n`));
            } catch {
              // Client disconnected
            }
          },
          close() {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          },
        });
      },
      cancel() {
        if (unregisterClient) {
          unregisterClient();
          unregisterClient = null;
        }
      },
    });

    // Clean up if request is aborted by client
    request.signal.addEventListener("abort", () => {
      if (unregisterClient) {
        unregisterClient();
        unregisterClient = null;
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable Nginx proxy buffering
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) {
      throw error;
    }
    console.error("[SSE Stream Route Error]:", error);
    return new Response(
      JSON.stringify({ error: "Internal SSE stream failure" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
