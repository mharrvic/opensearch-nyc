import { NextResponse } from "next/server";

import { serializeOpenSearchError } from "@/lib/opensearch/client";
import { executeSearchExport } from "@/lib/opensearch/search";
import { searchExportRequestSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = searchExportRequestSchema.safeParse({
      ...payload,
      page:
        typeof payload.page === "string" ? Number(payload.page) : payload.page,
      pageSize:
        typeof payload.pageSize === "string"
          ? Number(payload.pageSize)
          : payload.pageSize,
      exportPageSize:
        typeof payload.exportPageSize === "string"
          ? Number(payload.exportPageSize)
          : payload.exportPageSize,
      maxPages:
        typeof payload.maxPages === "string"
          ? Number(payload.maxPages)
          : payload.maxPages,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const response = await executeSearchExport(parsed.data);
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
