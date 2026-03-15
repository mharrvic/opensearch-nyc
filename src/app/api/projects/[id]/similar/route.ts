import { NextResponse } from "next/server";

import { isIndexMissingError, serializeOpenSearchError } from "@/lib/opensearch/client";
import { getSimilarProjects } from "@/lib/opensearch/similar";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await getSimilarProjects(id);

    return NextResponse.json(payload, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isIndexMissingError(error)) {
      return NextResponse.json(
        { error: "The index alias is not ready yet." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error: serializeOpenSearchError(error),
      },
      { status: 500 },
    );
  }
}
