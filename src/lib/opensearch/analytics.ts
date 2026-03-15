import {
  analyticsFilterDefinitions,
  type AnalyticsFilter,
} from "@/lib/analytics-filters";
import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient } from "@/lib/opensearch/client";
import {
  parseGeoBounds,
  parseGeoTileBuckets,
} from "@/lib/opensearch/geo";
import { getAliasIndices } from "@/lib/opensearch/schema";
import type { AnalyticsSnapshot, FacetBucket } from "@/lib/types";

type NumericMetric = {
  value?: number | null;
};

type StatsAggregation = {
  count?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  sum?: number | null;
};

type PercentilesAggregation = {
  values?: Record<string, number | string | null | undefined>;
};

type FiltersAggregation = {
  buckets?: Record<string, { doc_count: number }>;
};

type TermsAggregation = {
  buckets?: Array<{
    key: string | number;
    doc_count: number;
  }>;
};

type TimelineBucket = {
  key: string | number;
  key_as_string?: string;
  doc_count: number;
  budget_sum?: NumericMetric;
  avg_completion?: NumericMetric;
  phase_mix?: FiltersAggregation;
};

type AnalyticsResponseBody = {
  took?: number;
  hits?: {
    total?: number | { value?: number };
  };
  aggregations?: {
    budget_stats?: StatsAggregation;
    budget_percentiles?: PercentilesAggregation;
    completion_average?: NumericMetric;
    geo_projects?: { doc_count?: number };
    missing_forecast?: { doc_count?: number };
    phase_status?: FiltersAggregation;
    phase_counts?: TermsAggregation;
    borough_counts?: TermsAggregation;
    funding_counts?: TermsAggregation;
    forecast_timeline?: {
      buckets?: TimelineBucket[];
    };
    geo_bounds?: {
      bounds?: {
        top_left?: { lat?: number | null; lon?: number | null };
        bottom_right?: { lat?: number | null; lon?: number | null };
      };
    };
    geo_tiles?: TermsAggregation;
  };
};

type EmptyAnalyticsOptions = {
  notes?: string[];
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function buildFacetBuckets(aggregation?: TermsAggregation): FacetBucket[] {
  return (
    aggregation?.buckets?.map((bucket) => ({
      value: String(bucket.key),
      count: bucket.doc_count,
    })) ?? []
  );
}

function getPercentile(
  aggregation: PercentilesAggregation | undefined,
  key: string,
  fallback = 0,
) {
  return toNumber(aggregation?.values?.[key], fallback);
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function escapeWildcardValue(value: string) {
  return normalizeKeyword(value).replace(/[\\*?]/g, "\\$&");
}

function buildAnalyticsFilterClauses(filters: AnalyticsFilter[]) {
  return filters.map((filter) => {
    const definition = analyticsFilterDefinitions[filter.field];
    const field = definition.opensearchField;

    switch (filter.type) {
      case "options": {
        const values = filter.values.map(normalizeKeyword);

        if (filter.operator === "any_of") {
          return {
            terms: {
              [field]: values,
            },
          };
        }

        if (filter.operator === "none_of") {
          return {
            bool: {
              must_not: [
                {
                  terms: {
                    [field]: values,
                  },
                },
              ],
            },
          };
        }

        return {
          bool: {
            filter: values.map((value) => ({
              term: {
                [field]: value,
              },
            })),
          },
        };
      }
      case "string": {
        const value = escapeWildcardValue(filter.value);

        switch (filter.operator) {
          case "equals":
            return {
              term: {
                [field]: normalizeKeyword(filter.value),
              },
            };
          case "contains":
            return {
              wildcard: {
                [field]: {
                  value: `*${value}*`,
                },
              },
            };
          case "not_contains":
            return {
              bool: {
                must_not: [
                  {
                    wildcard: {
                      [field]: {
                        value: `*${value}*`,
                      },
                    },
                  },
                ],
              },
            };
          case "starts_with":
            return {
              prefix: {
                [field]: normalizeKeyword(filter.value),
              },
            };
          case "ends_with":
            return {
              wildcard: {
                [field]: {
                  value: `*${value}`,
                },
              },
            };
        }
      }
      case "number": {
        switch (filter.operator) {
          case "eq":
            return {
              term: {
                [field]: filter.value,
              },
            };
          case "gt":
            return {
              range: {
                [field]: {
                  gt: filter.value,
                },
              },
            };
          case "gte":
            return {
              range: {
                [field]: {
                  gte: filter.value,
                },
              },
            };
          case "lt":
            return {
              range: {
                [field]: {
                  lt: filter.value,
                },
              },
            };
          case "lte":
            return {
              range: {
                [field]: {
                  lte: filter.value,
                },
              },
            };
        }
      }
      case "date": {
        if (filter.operator === "is_null") {
          return {
            bool: {
              must_not: [
                {
                  exists: {
                    field,
                  },
                },
              ],
            },
          };
        }

        if (filter.operator === "is_not_null") {
          return {
            exists: {
              field,
            },
          };
        }

        if (filter.operator === "on") {
          return {
            term: {
              [field]: filter.value,
            },
          };
        }

        return {
          range: {
            [field]: {
              ...(filter.operator === "before" ? { lt: filter.value } : {}),
              ...(filter.operator === "after" ? { gt: filter.value } : {}),
              ...(filter.operator === "on_or_before"
                ? { lte: filter.value }
                : {}),
              ...(filter.operator === "on_or_after"
                ? { gte: filter.value }
                : {}),
            },
          },
        };
      }
      case "boolean":
        return {
          term: {
            [field]: filter.value,
          },
        };
    }
  });
}

export function buildAnalyticsRequestBody(filters: AnalyticsFilter[] = []) {
  const filterClauses = buildAnalyticsFilterClauses(filters);

  return {
    size: 0,
    track_total_hits: true,
    ...(filterClauses.length > 0
      ? {
          query: {
            bool: {
              filter: filterClauses,
            },
          },
        }
      : {}),
    aggs: {
      budget_stats: {
        stats: {
          field: "budget_sort",
        },
      },
      budget_percentiles: {
        percentiles: {
          field: "budget_sort",
          percents: [50, 90],
        },
      },
      completion_average: {
        avg: {
          field: "overall_percent_complete",
        },
      },
      geo_projects: {
        filter: {
          term: {
            has_coordinates: true,
          },
        },
      },
      missing_forecast: {
        filter: {
          bool: {
            must_not: [
              {
                exists: {
                  field: "forecast_completion",
                },
              },
            ],
          },
        },
      },
      phase_status: {
        filters: {
          filters: {
            completed: {
              term: {
                phase: "completed",
              },
            },
            active: {
              bool: {
                must_not: [
                  {
                    term: {
                      phase: "completed",
                    },
                  },
                ],
              },
            },
            planning: {
              terms: {
                phase: ["design", "procurement"],
              },
            },
            execution: {
              term: {
                phase: "construction",
              },
            },
          },
        },
      },
      phase_counts: {
        terms: {
          field: "phase",
          size: 10,
          order: {
            _count: "desc",
          },
        },
      },
      borough_counts: {
        terms: {
          field: "boroughs",
          size: 8,
          order: {
            _count: "desc",
          },
        },
      },
      funding_counts: {
        terms: {
          field: "funding_sources",
          size: 8,
          order: {
            _count: "desc",
          },
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
        },
      },
      forecast_timeline: {
        date_histogram: {
          field: "forecast_completion",
          calendar_interval: "year",
          min_doc_count: 1,
          format: "yyyy",
          order: {
            _key: "asc",
          },
        },
        aggs: {
          budget_sum: {
            sum: {
              field: "budget_sort",
            },
          },
          avg_completion: {
            avg: {
              field: "overall_percent_complete",
            },
          },
          phase_mix: {
            filters: {
              filters: {
                planned: {
                  terms: {
                    phase: ["design", "procurement"],
                  },
                },
                execution: {
                  term: {
                    phase: "construction",
                  },
                },
                completed: {
                  term: {
                    phase: "completed",
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function createEmptyAnalyticsSnapshot(
  alias: string,
  options: EmptyAnalyticsOptions = {},
): AnalyticsSnapshot {
  return {
    indexAlias: alias,
    indexReady: false,
    generatedAt: new Date().toISOString(),
    latencyMs: 0,
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    planningProjects: 0,
    executionProjects: 0,
    geoTaggedProjects: 0,
    missingForecastProjects: 0,
    averageCompletion: 0,
    budget: {
      sum: 0,
      average: 0,
      median: 0,
      p90: 0,
      max: 0,
    },
    phaseCounts: [],
    boroughCounts: [],
    fundingCounts: [],
    forecastTimeline: [],
    geo: {
      bounds: null,
      tiles: [],
    },
    debug: {
      request: options.request ?? {},
      response: options.response,
      notes: options.notes ?? [],
    },
  };
}

function parseAnalyticsResponse(
  alias: string,
  requestBody: Record<string, unknown>,
  responseBody: AnalyticsResponseBody,
  filters: AnalyticsFilter[],
): AnalyticsSnapshot {
  const aggregations = responseBody.aggregations;
  const phaseStatus = aggregations?.phase_status?.buckets ?? {};
  const missingForecastProjects = aggregations?.missing_forecast?.doc_count ?? 0;
  const totalProjects =
    typeof responseBody.hits?.total === "number"
      ? responseBody.hits.total
      : responseBody.hits?.total?.value ?? 0;
  const timeline =
    aggregations?.forecast_timeline?.buckets?.map((bucket) => {
      const phaseMix = bucket.phase_mix?.buckets ?? {};

      return {
        year: bucket.key_as_string ?? String(bucket.key),
        totalProjects: bucket.doc_count,
        planned: phaseMix.planned?.doc_count ?? 0,
        execution: phaseMix.execution?.doc_count ?? 0,
        completed: phaseMix.completed?.doc_count ?? 0,
        budgetTotal: toNumber(bucket.budget_sum?.value),
        averageCompletion: toNumber(bucket.avg_completion?.value),
      };
    }) ?? [];

  const notes = [
    "Aggregations use terms, filters, stats, percentiles, and a yearly date histogram on forecast_completion.",
    "Planning counts map to design and procurement phases, while execution maps to construction.",
  ];

  if (filters.length > 0) {
    notes.push(
      `${filters.length} filter${filters.length === 1 ? "" : "s"} applied at the query root with AND semantics.`,
    );
  }

  if (missingForecastProjects > 0) {
    notes.push(
      `${missingForecastProjects.toLocaleString()} projects are missing forecast_completion and do not appear in the yearly timeline.`,
    );
  }

  return {
    indexAlias: alias,
    indexReady: true,
    generatedAt: new Date().toISOString(),
    latencyMs: responseBody.took ?? 0,
    totalProjects,
    activeProjects: phaseStatus.active?.doc_count ?? 0,
    completedProjects: phaseStatus.completed?.doc_count ?? 0,
    planningProjects: phaseStatus.planning?.doc_count ?? 0,
    executionProjects: phaseStatus.execution?.doc_count ?? 0,
    geoTaggedProjects: aggregations?.geo_projects?.doc_count ?? 0,
    missingForecastProjects,
    averageCompletion: toNumber(aggregations?.completion_average?.value),
    budget: {
      sum: toNumber(aggregations?.budget_stats?.sum),
      average: toNumber(aggregations?.budget_stats?.avg),
      median: getPercentile(aggregations?.budget_percentiles, "50.0"),
      p90: getPercentile(aggregations?.budget_percentiles, "90.0"),
      max: toNumber(aggregations?.budget_stats?.max),
    },
    phaseCounts: buildFacetBuckets(aggregations?.phase_counts),
    boroughCounts: buildFacetBuckets(aggregations?.borough_counts),
    fundingCounts: buildFacetBuckets(aggregations?.funding_counts),
    forecastTimeline: timeline,
    geo: {
      bounds: parseGeoBounds(aggregations?.geo_bounds),
      tiles: parseGeoTileBuckets(aggregations?.geo_tiles),
    },
    debug: {
      request: requestBody,
      response: responseBody as Record<string, unknown>,
      notes,
    },
  };
}

export async function getAnalyticsSnapshot(
  filters: AnalyticsFilter[] = [],
): Promise<AnalyticsSnapshot> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const requestBody = buildAnalyticsRequestBody(filters);
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return createEmptyAnalyticsSnapshot(env.OPENSEARCH_INDEX_ALIAS, {
      request: requestBody,
      notes: [
        "The current alias does not exist yet. Run the reindex workflow before opening analytics.",
      ],
    });
  }

  const response = await client.search({
    index: env.OPENSEARCH_INDEX_ALIAS,
    body: requestBody as never,
  } as never);

  return parseAnalyticsResponse(
    env.OPENSEARCH_INDEX_ALIAS,
    requestBody,
    response.body as AnalyticsResponseBody,
    filters,
  );
}
