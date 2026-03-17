import { getServerEnv } from "@/lib/env";
import { embedTexts, probeEmbeddingDimension } from "@/lib/ollama";
import { fetchCapitalProjects, normalizeCapitalProject } from "@/lib/nyc-parks";
import { getOpenSearchClient } from "@/lib/opensearch/client";
import {
  buildVersionedIndexName,
  createVersionedIndex,
  ensurePipelines,
  pointAliasToIndex,
} from "@/lib/opensearch/schema";
import type { CapitalProjectDocument, ReindexReport } from "@/lib/types";

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function dedupeProjectsById(projects: CapitalProjectDocument[]) {
  const byId = new Map<string, CapitalProjectDocument>();

  for (const project of projects) {
    // The public source can emit multiple rows per project id; keep the last
    // occurrence to match the effective bulk-index behavior without re-embedding
    // overwritten documents.
    byId.set(project.project_id, project);
  }

  return [...byId.values()];
}

export async function runReindex(limit?: number): Promise<ReindexReport> {
  const startedAt = Date.now();
  const client = getOpenSearchClient();
  const env = getServerEnv();

  await ensurePipelines(client);

  const rawRows = await fetchCapitalProjects(limit);
  const normalizedProjects = dedupeProjectsById(
    rawRows.map(normalizeCapitalProject),
  );

  if (normalizedProjects.length === 0) {
    throw new Error("No capital projects were returned by the dataset.");
  }

  const embeddingDimensions = await probeEmbeddingDimension(
    normalizedProjects[0].embedding_text,
  );
  const indexName = buildVersionedIndexName();

  await createVersionedIndex(client, indexName, embeddingDimensions);

  let totalIndexed = 0;
  for (const batch of chunk(normalizedProjects, 24)) {
    const embeddings = await embedTexts(
      batch.map((project) => project.embedding_text),
    );
    const documents: CapitalProjectDocument[] = batch.map((project, index) => ({
      ...project,
      project_embedding: embeddings[index],
    }));
    const body = documents.flatMap((document) => [
      {
        index: {
          _index: indexName,
          _id: document.project_id,
        },
      },
      document,
    ]);

    const response = await client.bulk({
      body,
      pipeline: env.OPENSEARCH_INGEST_PIPELINE,
      refresh: false,
    });

    if (response.body.errors) {
      const failure = response.body.items?.find(
        (item: { index?: { error?: { reason?: string } } }) => item.index?.error,
      );

      throw new Error(
        failure?.index?.error?.reason ??
          "Bulk indexing failed for one or more documents.",
      );
    }

    totalIndexed += documents.length;
  }

  await client.indices.refresh({ index: indexName });
  await pointAliasToIndex(client, env.OPENSEARCH_INDEX_ALIAS, indexName);

  return {
    indexName,
    alias: env.OPENSEARCH_INDEX_ALIAS,
    totalFetched: rawRows.length,
    totalIndexed,
    embeddingDimensions,
    durationMs: Date.now() - startedAt,
  };
}
