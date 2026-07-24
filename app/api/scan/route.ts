import { NextRequest, NextResponse } from "next/server";
import { scanAddressStream } from "@/lib/aggregate";
import { getCachedScan, setCachedScan } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory rate limiter — resets on every cold start/redeploy. That's an
 * honest, documented limitation for a single personal deploy, not silently
 * pretending to be durable. Swap for a Neon-backed counter if this ever
 * needs to survive redeploys.
 */
const requestLog = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = requestLog.get(ip);
  if (!entry || now > entry.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + DAY_MS });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }
  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "You've used your 20 free scans today.", remaining: 0 },
      { status: 429 }
    );
  }

  let address: string;
  try {
    const body = await req.json();
    address = String(body?.address ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Invalid JSON body" }, { status: 400 });
  }

  if (!SOLANA_ADDRESS_RE.test(address)) {
    return NextResponse.json(
      { error: "invalid_address", message: "Not a valid Solana address" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      try {
        // Cache is a speed optimization, not a dependency — a Neon hiccup falls
        // through to a live scan rather than failing the request.
        const cached = await getCachedScan(address).catch(() => null);
        if (cached) {
          send({ type: "findings", findings: cached.findings });
          send({ type: "done", result: { ...cached, remaining_scans: remaining } });
          return;
        }

        for await (const event of scanAddressStream(address)) {
          if (event.type === "done") {
            setCachedScan(address, event.result).catch(() => {});
            send({ type: "done", result: { ...event.result, remaining_scans: remaining } });
          } else {
            send(event);
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Scan failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
