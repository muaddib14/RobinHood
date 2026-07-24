import { NextResponse } from "next/server";
import { getShare } from "@/lib/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;

  try {
    const result = await getShare(id);
    if (!result) {
      return NextResponse.json({ error: "not_found", message: "No shared scan with this id" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "lookup_failed", message: err instanceof Error ? err.message : "Failed to load shared scan" },
      { status: 502 }
    );
  }
}
