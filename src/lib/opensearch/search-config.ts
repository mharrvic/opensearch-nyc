import { getServerEnv } from "@/lib/env";
import type { SearchConfigId, SearchMode, SearchRequest } from "@/lib/types";

export type SearchConfigDefinition = {
  id: SearchConfigId;
  label: string;
  description: string;
  mode: SearchMode;
  pipelineId?: string;
  supportsVerboseDebug: boolean;
};

export function getSearchConfigDefinitions(): SearchConfigDefinition[] {
  const env = getServerEnv();

  return [
    {
      id: "lexical",
      label: "Lexical",
      description: "BM25 and prefix-focused keyword search.",
      mode: "lexical",
      supportsVerboseDebug: true,
    },
    {
      id: "vector",
      label: "Vector",
      description: "Dense vector similarity only.",
      mode: "vector",
      supportsVerboseDebug: true,
    },
    {
      id: "hybrid",
      label: "Hybrid",
      description: "Hybrid query with min-max normalization.",
      mode: "hybrid",
      pipelineId: env.OPENSEARCH_SEARCH_PIPELINE,
      supportsVerboseDebug: false,
    },
    {
      id: "hybrid_rrf",
      label: "Hybrid RRF",
      description: "Hybrid query reranked with reciprocal rank fusion.",
      mode: "hybrid",
      pipelineId: env.OPENSEARCH_RRF_SEARCH_PIPELINE,
      supportsVerboseDebug: false,
    },
  ];
}

export function getSearchConfig(id: SearchConfigId): SearchConfigDefinition {
  const match = getSearchConfigDefinitions().find((config) => config.id === id);

  if (!match) {
    throw new Error(`Unknown search config: ${id}`);
  }

  return match;
}

export function resolveSearchConfigId(input: SearchRequest): SearchConfigId {
  if (input.searchConfig) {
    return input.searchConfig;
  }

  switch (input.mode) {
    case "vector":
      return "vector";
    case "hybrid":
      return "hybrid";
    case "lexical":
    default:
      return "lexical";
  }
}
