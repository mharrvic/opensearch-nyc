import { NextResponse } from "next/server";

import { runReindex } from "@/lib/ingest";
import { serializeOpenSearchError } from "@/lib/opensearch/client";

export const runtime = "nodejs";

export async function POST() {
  try {
    const report = await runReindex();
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeOpenSearchError(error),
      },
      { status: 500 },
    );
  }
}
