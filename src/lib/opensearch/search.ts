import { embedTexts } from "@/lib/ollama";
import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient, isIndexMissingError } from "@/lib/opensearch/client";
import { getAliasIndices } from "@/lib/opensearch/schema";
import type {
  CapitalProjectDocument,
  FacetBucket,
  FilterState,
  SearchRequest,
  SearchResponse,
  SortOption,
} from "@/lib/types";

type AggregationBucket = {
  key: string;
  doc_count: number;
};

type SearchResponseBody = {
  hits?: {
    hits?: Array<{
      _id: string;
      _score?: number | string | null;
      _source?: CapitalProjectDocument;
      highlight?: Record<string, string[]>;
    }>;
    total?: number | { value?: number };
  };
  took?: number;
  aggregations?: Record<string, { buckets?: AggregationBucket[] }>;
  profile?: Record<string, unknown>;
};

function buildFacetBuckets(
  aggregations: Record<string, { buckets?: AggregationBucket[] }> | undefined,
  key: string,
): FacetBucket[] {
  return aggregations?.[key]?.buckets?.map((bucket) => ({
    value: String(bucket.key),
    count: bucket.doc_count,
  })) ?? [];
}

function buildKeywordFilters(filters: FilterState) {
  const queryFilters: Array<Record<string, unknown>> = [];

  if (filters.phases.length > 0) {
    queryFilters.push({
      terms: {
        phase: filters.phases.map((value) => value.toLowerCase()),
      },
    });
  }

  if (filters.boroughs.length > 0) {
    queryFilters.push({
      terms: {
        boroughs: filters.boroughs,
      },
    });
  }

  if (filters.fundingSources.length > 0) {
    queryFilters.push({
      terms: {
        funding_sources: filters.fundingSources,
      },
    });
  }

  if (filters.completion?.from || filters.completion?.to) {
    queryFilters.push({
      range: {
        forecast_completion: {
          ...(filters.completion.from ? { gte: filters.completion.from } : {}),
          ...(filters.completion.to ? { lte: filters.completion.to } : {}),
        },
      },
    });
  }

  if (filters.updatedSince) {
    queryFilters.push({
      range: {
        last_updated: {
          gte: filters.updatedSince,
        },
      },
    });
  }

  if (filters.hasCoordinates) {
    queryFilters.push({
      term: {
        has_coordinates: true,
      },
    });
  }

  if (filters.geo) {
    queryFilters.push({
      geo_distance: {
        distance: `${filters.geo.distanceKm}km`,
        location: {
          lat: filters.geo.lat,
          lon: filters.geo.lon,
        },
      },
    });
  }

  return queryFilters;
}

function buildBudgetFilters(filters: FilterState) {
  const queryFilters: Array<Record<string, unknown>> = [];
  const min = filters.budget?.min;
  const max = filters.budget?.max;

  if (typeof min === "number") {
    queryFilters.push({
      bool: {
        should: [
          {
            range: {
              budget_max: {
                gte: min,
              },
            },
          },
          {
            bool: {
              must_not: [
                {
                  exists: {
                    field: "budget_max",
                  },
                },
              ],
              filter: [
                {
                  range: {
                    budget_min: {
                      gte: min,
                    },
                  },
                },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (typeof max === "number") {
    queryFilters.push({
      range: {
        budget_min: {
          lte: max,
        },
      },
    });
  }

  return queryFilters;
}

function buildCommonFilters(filters: FilterState) {
  return [...buildKeywordFilters(filters), ...buildBudgetFilters(filters)];
}

function buildLexicalClause(query: string) {
  if (!query.trim()) {
    return { match_all: {} };
  }

  return {
    multi_match: {
      query,
      fields: [
        "title^5",
        "description^3",
        "search_text^2",
        "location_name^2",
        "boroughs^1.5",
        "funding_sources^1.5",
        "budget_band",
      ],
      type: "best_fields",
      fuzziness: "AUTO",
    },
  };
}

function buildSort(sort: SortOption) {
  switch (sort) {
    case "updated_desc":
      return [{ last_updated: "desc" }];
    case "updated_asc":
      return [{ last_updated: "asc" }];
    case "funding_desc":
      return [{ budget_sort: "desc" }];
    case "funding_asc":
      return [{ budget_sort: "asc" }];
    case "completion_asc":
      return [{ forecast_completion: "asc" }];
    case "completion_desc":
      return [{ forecast_completion: "desc" }];
    case "relevance":
    default:
      return ["_score"];
  }
}

export function buildSearchRequestBody(
  input: SearchRequest,
  queryVector?: number[],
) {
  const commonFilters = buildCommonFilters(input.filters);
  const lexicalClause = buildLexicalClause(input.query);
  const effectiveMode =
    (input.mode === "vector" || input.mode === "hybrid") && !queryVector
      ? "lexical"
      : input.mode;
  const supportsVerboseDebug = effectiveMode !== "hybrid";
  const paginationDepth = Math.max(input.page * input.pageSize * 3, 100);

  let query: Record<string, unknown>;

  if (effectiveMode === "vector" && queryVector) {
    query = {
      knn: {
        project_embedding: {
          vector: queryVector,
          k: paginationDepth,
          ...(commonFilters.length > 0
            ? {
                filter: {
                  bool: {
                    filter: commonFilters,
                  },
                },
              }
            : {}),
        },
      },
    };
  } else if (effectiveMode === "hybrid" && queryVector) {
    const hybridQuery = {
      hybrid: {
        pagination_depth: paginationDepth,
        queries: [
          lexicalClause,
          {
            knn: {
              project_embedding: {
                vector: queryVector,
                k: paginationDepth,
              },
            },
          },
        ],
      },
    };

    query =
      commonFilters.length > 0
        ? {
            bool: {
              must: [hybridQuery],
              filter: commonFilters,
            },
          }
        : hybridQuery;
  } else {
    query =
      commonFilters.length > 0
        ? {
            bool: {
              must: [lexicalClause],
              filter: commonFilters,
            },
          }
        : lexicalClause;
  }

  return {
    from: (input.page - 1) * input.pageSize,
    size: input.pageSize,
    track_total_hits: true,
    query,
    sort: buildSort(input.sort),
    aggs: {
      phases: {
        terms: {
          field: "phase",
          size: 10,
        },
      },
      boroughs: {
        terms: {
          field: "boroughs",
          size: 10,
        },
      },
      funding_sources: {
        terms: {
          field: "funding_sources",
          size: 12,
        },
      },
      budget_bands: {
        terms: {
          field: "budget_band",
          size: 10,
        },
      },
    },
    highlight:
      input.query.trim().length > 0
        ? {
            fields: {
              title: {},
              description: {},
              search_text: {},
            },
          }
        : undefined,
    profile: input.debug && supportsVerboseDebug,
    explain:
      input.debug && supportsVerboseDebug && effectiveMode !== "vector",
    _source: true,
    effectiveMode,
  };
}

export async function executeSearch(input: SearchRequest): Promise<SearchResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return {
      hits: [],
      total: 0,
      latencyMs: 0,
      mode: input.mode,
      facets: {
        phases: [],
        boroughs: [],
        fundingSources: [],
        budgetBands: [],
      },
      debug: input.debug
        ? {
            request: {},
            warning:
              "The current alias does not exist yet. Run the reindex action first.",
          }
        : undefined,
    };
  }

  const queryVector =
    input.mode === "lexical" || !input.query.trim()
      ? undefined
      : (await embedTexts([input.query]))[0];

  const body = buildSearchRequestBody(input, queryVector);
  const { effectiveMode, ...requestBody } = body;
  const hybridDebugWarning =
    input.debug && effectiveMode === "hybrid"
      ? "Hybrid debug mode omits profile and explain because OpenSearch 3.3.0 can throw an internal Neural Search null-pointer for those flags."
      : undefined;

  try {
    const response = await client.search({
      index: env.OPENSEARCH_INDEX_ALIAS,
      body: requestBody as never,
      ...(effectiveMode === "hybrid"
        ? {
            search_pipeline: env.OPENSEARCH_SEARCH_PIPELINE,
          }
        : {}),
    } as never);
    const responseBody = response.body as SearchResponseBody;

    const hits = (responseBody.hits?.hits ?? []).map((hit) => {
        const source = hit._source as CapitalProjectDocument;
        const numericScore =
          typeof hit._score === "number"
            ? hit._score
            : typeof hit._score === "string"
              ? Number(hit._score)
              : null;

        return {
          id: hit._id,
          score: Number.isFinite(numericScore) ? numericScore : null,
          title: source.title,
          description: source.description,
          phase: source.phase,
          status: source.status,
          boroughs: source.boroughs,
          fundingSources: source.funding_sources,
          budgetBand: source.budget_band,
          budgetMin: source.budget_min,
          budgetMax: source.budget_max,
          forecastCompletion: source.forecast_completion,
          lastUpdated: source.last_updated,
          agency: source.agency,
          locationName: source.location_name,
          parkId: source.park_id,
          projectLiaison: source.project_liaison,
          overallPercentComplete: source.overall_percent_complete,
          hasCoordinates: source.has_coordinates,
          location: source.location,
          highlights: hit.highlight ?? {},
        };
      });

    return {
      hits,
      total:
        typeof responseBody.hits?.total === "number"
          ? responseBody.hits.total
          : responseBody.hits?.total?.value ?? 0,
      latencyMs: responseBody.took ?? 0,
      mode: effectiveMode,
      facets: {
        phases: buildFacetBuckets(responseBody.aggregations, "phases"),
        boroughs: buildFacetBuckets(responseBody.aggregations, "boroughs"),
        fundingSources: buildFacetBuckets(responseBody.aggregations, "funding_sources"),
        budgetBands: buildFacetBuckets(responseBody.aggregations, "budget_bands"),
      },
      debug: input.debug
        ? {
            request: requestBody as Record<string, unknown>,
            response: responseBody,
            profile:
              typeof responseBody.profile === "object"
                ? (responseBody.profile as Record<string, unknown>)
                : undefined,
            warning: hybridDebugWarning,
          }
        : undefined,
    };
  } catch (error) {
    if (isIndexMissingError(error)) {
      return {
        hits: [],
        total: 0,
        latencyMs: 0,
        mode: input.mode,
        facets: {
          phases: [],
          boroughs: [],
          fundingSources: [],
          budgetBands: [],
        },
        debug: input.debug
          ? {
              request: requestBody as Record<string, unknown>,
              warning:
                "The alias points to a missing index. Re-run the reindex workflow.",
            }
          : undefined,
      };
    }

    throw error;
  }
}

export async function getProjectById(projectId: string) {
  const env = getServerEnv();
  const client = getOpenSearchClient();

  const response = await client.search({
    index: env.OPENSEARCH_INDEX_ALIAS,
    body: {
      size: 1,
      query: {
        term: {
          project_id: projectId,
        },
      },
    },
  });

  const hit = response.body.hits?.hits?.[0]?._source as CapitalProjectDocument | undefined;
  return hit ?? null;
}
