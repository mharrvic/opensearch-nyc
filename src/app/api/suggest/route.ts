import { NextResponse } from "next/server";

import { serializeOpenSearchError } from "@/lib/opensearch/client";
import { getSuggestions } from "@/lib/opensearch/suggest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const payload = await getSuggestions(query);

    return NextResponse.json(payload, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeOpenSearchError(error),
      },
      { status: 500 },
    );
  }
}
