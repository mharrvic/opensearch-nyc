import { NextResponse } from "next/server";

import { analyticsRequestSchema } from "@/lib/analytics-filters";
import { serializeOpenSearchError } from "@/lib/opensearch/client";
import { getAnalyticsSnapshot } from "@/lib/opensearch/analytics";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getAnalyticsSnapshot();

    return NextResponse.json(snapshot, {
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = analyticsRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const snapshot = await getAnalyticsSnapshot(parsed.data.filters);

    return NextResponse.json(snapshot, {
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
