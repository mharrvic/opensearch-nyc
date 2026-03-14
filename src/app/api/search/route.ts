import { NextResponse } from "next/server";

import { executeSearch } from "@/lib/opensearch/search";
import { serializeOpenSearchError } from "@/lib/opensearch/client";
import { searchRequestSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = searchRequestSchema.safeParse({
      ...payload,
      page:
        typeof payload.page === "string" ? Number(payload.page) : payload.page,
      pageSize:
        typeof payload.pageSize === "string"
          ? Number(payload.pageSize)
          : payload.pageSize,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const response = await executeSearch(parsed.data);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: serializeOpenSearchError(error),
      },
      { status: 500 },
    );
  }
}
