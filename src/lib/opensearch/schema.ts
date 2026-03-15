import type { Client } from "@opensearch-project/opensearch";
import { format } from "date-fns";

import { getServerEnv } from "@/lib/env";
import { isIndexMissingError } from "@/lib/opensearch/client";

export function buildVersionedIndexName(now = new Date()) {
  return `capital-projects-v${format(now, "yyyyMMddHHmmss")}`;
}

function buildIndexBody(embeddingDimensions: number) {
  const env = getServerEnv();

  return {
    settings: {
      index: {
        knn: true,
        number_of_shards: 1,
        number_of_replicas: 0,
        default_pipeline: env.OPENSEARCH_INGEST_PIPELINE,
        "search.default_pipeline": env.OPENSEARCH_SEARCH_PIPELINE,
      },
      analysis: {
        normalizer: {
          facet_normalizer: {
            type: "custom",
            filter: ["lowercase", "asciifolding"],
          },
        },
        filter: {
          project_synonyms: {
            type: "synonym_graph",
            synonyms: [
              "playground, play area",
              "waterfront, shoreline, seawall",
              "restroom, bathroom, comfort station",
              "reconstruction, renovation, rebuild",
              "resiliency, resilience, flood protection",
              "greenway, esplanade, promenade",
              "spray shower, splash pad, sprinkler",
            ],
          },
          english_stop: {
            type: "stop",
            stopwords: "_english_",
          },
          english_stemmer: {
            type: "stemmer",
            language: "english",
          },
          english_possessive_stemmer: {
            type: "stemmer",
            language: "possessive_english",
          },
        },
        analyzer: {
          english_synonym_search: {
            tokenizer: "standard",
            filter: [
              "lowercase",
              "english_possessive_stemmer",
              "project_synonyms",
              "english_stop",
              "english_stemmer",
            ],
          },
          suggest_index: {
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding"],
          },
        },
      },
    },
    mappings: {
      dynamic: false,
      properties: {
        project_id: { type: "keyword" },
        fms_id: { type: "keyword" },
        title: {
          type: "text",
          analyzer: "english",
          search_analyzer: "english_synonym_search",
          term_vector: "with_positions_offsets",
          fields: {
            keyword: { type: "keyword", normalizer: "facet_normalizer" },
            autocomplete: {
              type: "search_as_you_type",
              analyzer: "standard",
              max_shingle_size: 3,
            },
          },
        },
        description: {
          type: "text",
          analyzer: "english",
          search_analyzer: "english_synonym_search",
          term_vector: "with_positions_offsets",
        },
        agency: { type: "keyword", normalizer: "facet_normalizer" },
        phase: { type: "keyword", normalizer: "facet_normalizer" },
        status: { type: "keyword", normalizer: "facet_normalizer" },
        boroughs: { type: "keyword", normalizer: "facet_normalizer" },
        funding_sources: { type: "keyword", normalizer: "facet_normalizer" },
        budget_band: { type: "keyword", normalizer: "facet_normalizer" },
        budget_min: { type: "double" },
        budget_max: { type: "double" },
        budget_sort: { type: "double" },
        project_liaison: {
          type: "keyword",
          normalizer: "facet_normalizer",
        },
        location_name: {
          type: "text",
          analyzer: "english",
          search_analyzer: "english_synonym_search",
          term_vector: "with_positions_offsets",
          fields: {
            keyword: { type: "keyword", normalizer: "facet_normalizer" },
            autocomplete: {
              type: "search_as_you_type",
              analyzer: "standard",
              max_shingle_size: 3,
            },
          },
        },
        park_id: { type: "keyword" },
        design_percent_complete: { type: "double" },
        procurement_percent_complete: { type: "double" },
        construction_percent_complete: { type: "double" },
        overall_percent_complete: { type: "double" },
        design_start: { type: "date" },
        design_projected_completion: { type: "date" },
        design_adjusted_completion: { type: "date" },
        design_actual_completion: { type: "date" },
        procurement_start: { type: "date" },
        procurement_projected_completion: { type: "date" },
        procurement_adjusted_completion: { type: "date" },
        procurement_actual_completion: { type: "date" },
        construction_start: { type: "date" },
        construction_projected_completion: { type: "date" },
        construction_adjusted_completion: { type: "date" },
        construction_actual_completion: { type: "date" },
        forecast_completion: { type: "date" },
        last_updated: { type: "date" },
        has_coordinates: { type: "boolean" },
        location: { type: "geo_point" },
        tags: { type: "keyword", normalizer: "facet_normalizer" },
        source_url: { type: "keyword" },
        source_dataset: { type: "keyword" },
        search_text: {
          type: "text",
          analyzer: "english",
          search_analyzer: "english_synonym_search",
          term_vector: "with_positions_offsets",
          fields: {
            autocomplete: {
              type: "search_as_you_type",
              analyzer: "standard",
              max_shingle_size: 3,
            },
          },
        },
        project_suggest: {
          type: "completion",
          analyzer: "suggest_index",
          search_analyzer: "suggest_index",
          preserve_position_increments: false,
        },
        project_embedding: {
          type: "knn_vector",
          dimension: embeddingDimensions,
          method: {
            name: "hnsw",
            engine: "lucene",
            space_type: "cosinesimil",
            parameters: {
              ef_construction: 128,
              m: 24,
            },
          },
        },
        raw_source: {
          type: "object",
          enabled: false,
        },
        ingested_at: { type: "date" },
      },
    },
  };
}

export async function ensurePipelines(client: Client) {
  const env = getServerEnv();

  await client.transport.request({
    method: "PUT",
    path: `/_ingest/pipeline/${env.OPENSEARCH_INGEST_PIPELINE}`,
    body: {
      description: "Normalize capital project strings and track ingest time.",
      processors: [
        {
          lowercase: {
            field: "agency",
            ignore_missing: true,
          },
        },
        {
          lowercase: {
            field: "phase",
            ignore_missing: true,
          },
        },
        {
          lowercase: {
            field: "status",
            ignore_missing: true,
          },
        },
        {
          set: {
            field: "ingested_at",
            value: "{{_ingest.timestamp}}",
          },
        },
      ],
    },
  });

  await client.searchPipeline.put({
    id: env.OPENSEARCH_SEARCH_PIPELINE,
    body: {
      description: "Post processor for normalized hybrid search.",
      phase_results_processors: [
        {
          "normalization-processor": {
            normalization: {
              technique: "min_max",
            },
            combination: {
              technique: "arithmetic_mean",
              parameters: {
                weights: [0.45, 0.55],
              },
            },
          },
        },
      ],
    } as never,
  });

  await client.searchPipeline.put({
    id: env.OPENSEARCH_RRF_SEARCH_PIPELINE,
    body: {
      description: "Post processor for hybrid RRF search.",
      phase_results_processors: [
        {
          "score-ranker-processor": {
            combination: {
              technique: "rrf",
              rank_constant: 40,
              parameters: {
                weights: [0.55, 0.45],
              },
            },
          },
        },
      ],
    } as never,
  });
}

export async function createVersionedIndex(
  client: Client,
  indexName: string,
  embeddingDimensions: number,
) {
  return client.indices.create({
    index: indexName,
    body: buildIndexBody(embeddingDimensions) as never,
  });
}

export async function getAliasIndices(client: Client, alias: string) {
  try {
    const response = await client.indices.getAlias({ name: alias });
    return Object.keys(response.body ?? {});
  } catch (error) {
    const statusCode = (error as { meta?: { statusCode?: number } })?.meta
      ?.statusCode;

    if (isIndexMissingError(error) || statusCode === 404) {
      return [];
    }

    throw error;
  }
}

export async function pointAliasToIndex(
  client: Client,
  alias: string,
  indexName: string,
) {
  const existingIndices = await getAliasIndices(client, alias);
  const actions: Array<{
    remove?: { index: string; alias: string };
    add?: { index: string; alias: string };
  }> = existingIndices.map((existingIndex) => ({
    remove: {
      index: existingIndex,
      alias,
    },
  }));

  actions.push({
    add: {
      index: indexName,
      alias,
    },
  });

  await client.indices.updateAliases({
    body: {
      actions: actions as never,
    },
  });
}

export async function hasIngestPipeline(client: Client, pipelineId: string) {
  try {
    await client.transport.request({
      method: "GET",
      path: `/_ingest/pipeline/${pipelineId}`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function hasSearchPipeline(client: Client, pipelineId: string) {
  try {
    await client.searchPipeline.get({ id: pipelineId });
    return true;
  } catch {
    return false;
  }
}
