import { NextRequest, NextResponse } from "next/server";
import { addToWatchlist } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  let address: string;
  let label: string | undefined;
  try {
    const body = await req.json();
    address = String(body?.address ?? "").trim();
    label = body?.label ? String(body.label).trim() : undefined;
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
    const entry = await addToWatchlist(ip, address, label);
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "watchlist_failed", message: err instanceof Error ? err.message : "Failed to add to watchlist" },
      { status: 502 }
    );
  }
}
