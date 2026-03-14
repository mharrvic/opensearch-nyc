import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getOllamaStatus } from "@/lib/ollama";
import {
  getOpenSearchClient,
  serializeOpenSearchError,
} from "@/lib/opensearch/client";
import {
  getAliasIndices,
  hasIngestPipeline,
  hasSearchPipeline,
} from "@/lib/opensearch/schema";
import type { ClusterStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const env = getServerEnv();
  const ollama = await getOllamaStatus();

  try {
    const client = getOpenSearchClient();
    const [info, health, aliasIndices, searchPipelineReady, ingestPipelineReady] =
      await Promise.all([
        client.info(),
        client.cluster.health(),
        getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS),
        hasSearchPipeline(client, env.OPENSEARCH_SEARCH_PIPELINE),
        hasIngestPipeline(client, env.OPENSEARCH_INGEST_PIPELINE),
      ]);

    const documentCount =
      aliasIndices.length > 0
        ? (await client.count({ index: env.OPENSEARCH_INDEX_ALIAS })).body.count ?? 0
        : 0;

    const payload: ClusterStatus = {
      connected: true,
      clusterName: info.body.cluster_name ?? null,
      version: info.body.version?.number ?? null,
      status: health.body.status ?? null,
      indexAlias: env.OPENSEARCH_INDEX_ALIAS,
      indexReady: aliasIndices.length > 0,
      documentCount,
      searchPipelineReady,
      ingestPipelineReady,
      ollamaReachable: ollama.reachable,
      ollamaModel: env.OLLAMA_EMBED_MODEL,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const payload: ClusterStatus = {
      connected: false,
      clusterName: null,
      version: null,
      status: null,
      indexAlias: env.OPENSEARCH_INDEX_ALIAS,
      indexReady: false,
      documentCount: 0,
      searchPipelineReady: false,
      ingestPipelineReady: false,
      ollamaReachable: ollama.reachable,
      ollamaModel: env.OLLAMA_EMBED_MODEL,
      error: serializeOpenSearchError(error),
    };

    return NextResponse.json(payload);
  }
}
