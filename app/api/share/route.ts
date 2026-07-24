import { NextRequest, NextResponse } from "next/server";
import { saveShare } from "@/lib/shares";
import type { ScanResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let result: ScanResult;
  try {
    const body = await req.json();
    if (!body?.address || !body?.verdict || !Array.isArray(body?.findings)) {
      throw new Error("missing required scan fields");
    }
    result = body as ScanResult;
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Invalid scan result" }, { status: 400 });
  }

  try {
    const id = await saveShare(result);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "share_failed", message: err instanceof Error ? err.message : "Failed to create share link" },
      { status: 502 }
    );
  }
}
