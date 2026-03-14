import { NextResponse } from "next/server";

import { getProjectById } from "@/lib/opensearch/search";
import {
  isIndexMissingError,
  serializeOpenSearchError,
} from "@/lib/opensearch/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const project = await getProjectById(id);

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(project);
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
