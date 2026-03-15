import { embedTexts } from "@/lib/ollama";
import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient, isIndexMissingError } from "@/lib/opensearch/client";
import {
  parseGeoBounds,
  parseGeoTileBuckets,
  toOpenSearchBounds,
} from "@/lib/opensearch/geo";
import {
  getSearchConfig,
  resolveSearchConfigId,
} from "@/lib/opensearch/search-config";
import { getAliasIndices } from "@/lib/opensearch/schema";
import type {
  CapitalProjectDocument,
  FacetBucket,
  FilterState,
  SearchConfigId,
  SearchCursor,
  SearchExportRequest,
  SearchExportResponse,
  SearchHit,
  SearchMode,
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
    hits?: RawSearchHit[];
    total?: number | { value?: number };
  };
  took?: number;
  aggregations?: Record<string, unknown>;
  profile?: Record<string, unknown>;
};

type RawSearchHit = {
  _id: string;
  _score?: number | string | null;
  _source?: CapitalProjectDocument;
  highlight?: Record<string, string[]>;
  sort?: Array<string | number>;
};

type ExportCursorInput = {
  pitId: string;
  keepAlive: string;
  sortValues?: Array<string | number>;
};

type SearchRequestBuildOptions = {
  includeAggregations?: boolean;
  includeHighlights?: boolean;
  cursor?: ExportCursorInput;
};

type BuiltSearchRequestBody = Record<string, unknown> & {
  effectiveMode: SearchMode;
  searchConfig: SearchConfigId;
  pipelineId?: string;
};

function buildFacetBuckets(
  aggregations: Record<string, unknown> | undefined,
  key: string,
): FacetBucket[] {
  const aggregation = aggregations?.[key] as
    | { buckets?: AggregationBucket[] }
    | undefined;

  return (
    aggregation?.buckets?.map((bucket) => ({
      value: String(bucket.key),
      count: bucket.doc_count,
    })) ?? []
  );
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

  if (filters.bbox) {
    queryFilters.push({
      geo_bounding_box: {
        location: toOpenSearchBounds(filters.bbox),
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
    bool: {
      should: [
        {
          multi_match: {
            query,
            fields: [
              "title^5",
              "description^3",
              "search_text^2.5",
              "location_name^2",
              "boroughs^1.5",
              "funding_sources^1.5",
              "budget_band",
            ],
            type: "best_fields",
            fuzziness: "AUTO",
          },
        },
        {
          multi_match: {
            query,
            type: "bool_prefix",
            fields: [
              "title.autocomplete^6",
              "title.autocomplete._2gram^5",
              "title.autocomplete._3gram^4",
              "location_name.autocomplete^3",
              "location_name.autocomplete._2gram^2.5",
              "location_name.autocomplete._3gram^2",
              "search_text.autocomplete^2.5",
              "search_text.autocomplete._2gram^2",
              "search_text.autocomplete._3gram^1.5",
            ],
          },
        },
        {
          match_phrase_prefix: {
            title: {
              query,
              boost: 4,
            },
          },
        },
        {
          match_phrase_prefix: {
            location_name: {
              query,
              boost: 2,
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

function buildSort(sort: SortOption) {
  switch (sort) {
    case "updated_desc":
      return [{ last_updated: "desc" }, { project_id: "asc" }];
    case "updated_asc":
      return [{ last_updated: "asc" }, { project_id: "asc" }];
    case "funding_desc":
      return [{ budget_sort: "desc" }, { project_id: "asc" }];
    case "funding_asc":
      return [{ budget_sort: "asc" }, { project_id: "asc" }];
    case "completion_asc":
      return [{ forecast_completion: "asc" }, { project_id: "asc" }];
    case "completion_desc":
      return [{ forecast_completion: "desc" }, { project_id: "asc" }];
    case "relevance":
    default:
      return [{ _score: "desc" }, { project_id: "asc" }];
  }
}

function buildAggregations(filters: FilterState) {
  return {
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
    geo_bounds: {
      geo_bounds: {
        field: "location",
        wrap_longitude: false,
      },
    },
    geo_tiles: {
      geotile_grid: {
        field: "location",
        precision: 7,
        ...(filters.bbox ? { bounds: toOpenSearchBounds(filters.bbox) } : {}),
      },
    },
  };
}

export function mapSearchHit(hit: RawSearchHit): SearchHit {
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
    sortValues: hit.sort,
  };
}

function getTotalHits(responseBody: SearchResponseBody) {
  return typeof responseBody.hits?.total === "number"
    ? responseBody.hits.total
    : responseBody.hits?.total?.value ?? 0;
}

function buildCursorFromHits(
  pitId: string,
  keepAlive: string,
  hits: SearchHit[],
): SearchCursor | null {
  const lastSortValues = hits.at(-1)?.sortValues;

  if (!lastSortValues || lastSortValues.length === 0) {
    return null;
  }

  return {
    pitId,
    keepAlive,
    sortValues: lastSortValues,
  };
}

async function createPit(index: string, keepAlive: string) {
  const client = getOpenSearchClient();
  const response = await client.transport.request({
    method: "POST",
    path: `/${index}/_search/point_in_time`,
    querystring: {
      keep_alive: keepAlive,
    },
  });

  return String((response.body as { pit_id?: string }).pit_id ?? "");
}

async function deletePit(pitId: string) {
  const client = getOpenSearchClient();

  if (!pitId) {
    return;
  }

  await client.transport.request({
    method: "DELETE",
    path: "/_search/point_in_time",
    body: {
      pit_id: [pitId],
    },
  });
}

function createEmptySearchResponse(
  requestedConfig: SearchConfigId,
  requestedMode: SearchMode,
  debug: boolean,
  warning?: string,
): SearchResponse {
  return {
    hits: [],
    total: 0,
    latencyMs: 0,
    mode: requestedMode,
    searchConfig: requestedConfig,
    facets: {
      phases: [],
      boroughs: [],
      fundingSources: [],
      budgetBands: [],
    },
    geo: {
      bounds: null,
      tiles: [],
    },
    debug: debug
      ? {
          request: {},
          warning,
        }
      : undefined,
  };
}

export function buildSearchRequestBody(
  input: SearchRequest,
  queryVector?: number[],
  options: SearchRequestBuildOptions = {},
): BuiltSearchRequestBody {
  const requestedConfigId = resolveSearchConfigId(input);
  const requestedConfig = getSearchConfig(requestedConfigId);
  const lexicalClause = buildLexicalClause(input.query);
  const commonFilters = buildCommonFilters(input.filters);
  const effectiveMode =
    requestedConfig.mode !== "lexical" && !queryVector
      ? "lexical"
      : requestedConfig.mode;
  const effectiveConfig =
    effectiveMode === requestedConfig.mode
      ? requestedConfig
      : getSearchConfig("lexical");
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
    ...(options.cursor
      ? {
          size: input.pageSize,
          pit: {
            id: options.cursor.pitId,
            keep_alive: options.cursor.keepAlive,
          },
          ...(options.cursor.sortValues
            ? {
                search_after: options.cursor.sortValues,
              }
            : {}),
        }
      : {
          from: (input.page - 1) * input.pageSize,
          size: input.pageSize,
        }),
    track_total_hits: true,
    query,
    sort: buildSort(input.sort),
    ...(options.includeAggregations ?? true
      ? {
          aggs: buildAggregations(input.filters),
        }
      : {}),
    highlight:
      (options.includeHighlights ?? true) && input.query.trim().length > 0
        ? {
            fields: {
              title: {},
              description: {},
              search_text: {},
            },
          }
        : undefined,
    profile: input.debug && effectiveConfig.supportsVerboseDebug,
    explain:
      input.debug &&
      effectiveConfig.supportsVerboseDebug &&
      effectiveMode !== "vector",
    _source: true,
    effectiveMode,
    searchConfig: effectiveConfig.id,
    pipelineId: effectiveConfig.pipelineId,
  };
}

export async function executeSearch(input: SearchRequest): Promise<SearchResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const requestedConfigId = resolveSearchConfigId(input);
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return createEmptySearchResponse(
      requestedConfigId,
      input.mode,
      input.debug,
      "The current alias does not exist yet. Run the reindex action first.",
    );
  }

  const requestedConfig = getSearchConfig(requestedConfigId);
  const queryVector =
    requestedConfig.mode === "lexical" || !input.query.trim()
      ? undefined
      : (await embedTexts([input.query]))[0];

  const body = buildSearchRequestBody(input, queryVector);
  const { effectiveMode, searchConfig, pipelineId, ...requestBody } = body;
  const hybridDebugWarning =
    input.debug && pipelineId
      ? "Hybrid debug mode omits profile and explain because OpenSearch 3.3.0 can throw an internal Neural Search null-pointer for those flags."
      : undefined;

  try {
    const response = await client.search({
      index: env.OPENSEARCH_INDEX_ALIAS,
      body: requestBody as never,
      ...(pipelineId
        ? {
            search_pipeline: pipelineId,
          }
        : {}),
    } as never);
    const responseBody = response.body as SearchResponseBody;
    const hits = (responseBody.hits?.hits ?? []).map(mapSearchHit);
    const aggregations = responseBody.aggregations as Record<string, unknown> | undefined;

    return {
      hits,
      total: getTotalHits(responseBody),
      latencyMs: responseBody.took ?? 0,
      mode: effectiveMode,
      searchConfig,
      facets: {
        phases: buildFacetBuckets(aggregations, "phases"),
        boroughs: buildFacetBuckets(aggregations, "boroughs"),
        fundingSources: buildFacetBuckets(aggregations, "funding_sources"),
        budgetBands: buildFacetBuckets(aggregations, "budget_bands"),
      },
      geo: {
        bounds: parseGeoBounds(
          aggregations?.geo_bounds as
            | {
                bounds?: {
                  top_left?: { lat?: number | null; lon?: number | null };
                  bottom_right?: { lat?: number | null; lon?: number | null };
                };
              }
            | undefined,
        ),
        tiles: parseGeoTileBuckets(
          aggregations?.geo_tiles as { buckets?: AggregationBucket[] } | undefined,
        ),
      },
      debug: input.debug
        ? {
            request: requestBody as Record<string, unknown>,
            response: responseBody as Record<string, unknown>,
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
      return createEmptySearchResponse(
        requestedConfigId,
        input.mode,
        input.debug,
        "The alias points to a missing index. Re-run the reindex workflow.",
      );
    }

    throw error;
  }
}

export async function executeSearchExport(
  input: SearchExportRequest,
): Promise<SearchExportResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const requestedConfigId = resolveSearchConfigId(input);
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return {
      hits: [],
      total: 0,
      exportedCount: 0,
      latencyMs: 0,
      searchConfig: requestedConfigId,
      cursor: null,
      done: true,
    };
  }

  const requestedConfig = getSearchConfig(requestedConfigId);
  const queryVector =
    requestedConfig.mode === "lexical" || !input.query.trim()
      ? undefined
      : (await embedTexts([input.query]))[0];

  let pitId = input.cursor?.pitId;
  const keepAlive = input.cursor?.keepAlive ?? "2m";
  let searchAfter = input.cursor?.sortValues;
  let total = 0;
  let latencyMs = 0;
  const hits: SearchHit[] = [];
  let done = false;

  if (!pitId) {
    pitId = await createPit(env.OPENSEARCH_INDEX_ALIAS, keepAlive);
  }

  for (let pageIndex = 0; pageIndex < input.maxPages; pageIndex += 1) {
    const body = buildSearchRequestBody(
      {
        ...input,
        page: 1,
        pageSize: input.exportPageSize,
      },
      queryVector,
      {
        includeAggregations: false,
        includeHighlights: false,
        cursor: {
          pitId,
          keepAlive,
          sortValues: searchAfter,
        },
      },
    );
    const { pipelineId, ...requestBody } = body;
    const response = await client.search({
      body: requestBody as never,
      ...(pipelineId
        ? {
            search_pipeline: pipelineId,
          }
        : {}),
    } as never);
    const responseBody = response.body as SearchResponseBody;
    const pageHits = (responseBody.hits?.hits ?? []).map(mapSearchHit);

    total = getTotalHits(responseBody);
    latencyMs += responseBody.took ?? 0;
    hits.push(...pageHits);

    if (
      pageHits.length < input.exportPageSize ||
      hits.length >= total ||
      !pageHits.at(-1)?.sortValues
    ) {
      done = true;
      break;
    }

    searchAfter = pageHits.at(-1)?.sortValues;
  }

  const cursor =
    done || input.closeCursor || !pitId
      ? null
      : buildCursorFromHits(pitId, keepAlive, hits);

  if ((done || input.closeCursor) && pitId) {
    try {
      await deletePit(pitId);
    } catch {
      // PIT cleanup failure should not fail the export payload.
    }
  }

  return {
    hits,
    total,
    exportedCount: hits.length,
    latencyMs,
    searchConfig: resolveSearchConfigId(input),
    cursor,
    done: done || cursor === null,
  };
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

  const hit = response.body.hits?.hits?.[0]?._source as
    | CapitalProjectDocument
    | undefined;
  return hit ?? null;
}
