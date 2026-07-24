import { NextRequest, NextResponse } from "next/server";
import { scanAddress } from "@/lib/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory rate limiter — no Supabase in M1, so this resets on every cold
 * start/redeploy. That's an honest, documented limitation for a single
 * personal deploy, not silently pretending to be durable. Swap for a
 * Supabase-backed counter once M2 lands.
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

  try {
    const result = await scanAddress(address);
    return NextResponse.json({ ...result, remaining_scans: remaining });
  } catch (err) {
    return NextResponse.json(
      { error: "scan_failed", message: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
