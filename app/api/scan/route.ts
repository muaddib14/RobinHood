import { NextRequest, NextResponse } from "next/server";
import { scanAddress } from "@/lib/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json();
    address = String(body?.address ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!SOLANA_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Not a valid Solana address" }, { status: 400 });
  }

  try {
    const result = await scanAddress(address);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
