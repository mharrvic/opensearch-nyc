import { NextResponse } from "next/server";

import { serializeOpenSearchError } from "@/lib/opensearch/client";
import { evaluateRelevance } from "@/lib/opensearch/relevance";
import { relevanceEvalRequestSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await evaluateRelevance();

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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = relevanceEvalRequestSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error.flatten(),
        },
        { status: 400 },
      );
    }

    const evaluation = await evaluateRelevance(result.data);

    return NextResponse.json(evaluation, {
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
