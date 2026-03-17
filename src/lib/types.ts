import { z } from "zod";

export const searchModeSchema = z.enum(["lexical", "vector", "hybrid"]);
export const searchConfigSchema = z.enum([
  "lexical",
  "vector",
  "hybrid",
  "hybrid_rrf",
]);
export const sortOptionSchema = z.enum([
  "relevance",
  "updated_desc",
  "updated_asc",
  "funding_desc",
  "funding_asc",
  "completion_asc",
  "completion_desc",
]);

export const numericRangeSchema = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
});

export const dateRangeSchema = z.object({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
});

export const geoFilterSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  distanceKm: z.number().positive().max(500),
});

export const geoBoundsSchema = z
  .object({
    top: z.number().min(-90).max(90),
    left: z.number().min(-180).max(180),
    bottom: z.number().min(-90).max(90),
    right: z.number().min(-180).max(180),
  })
  .refine((value) => value.top >= value.bottom, {
    message: "The top latitude must be greater than or equal to the bottom latitude.",
  });

const sortCursorValueSchema = z.union([z.string(), z.number()]);

export const searchCursorSchema = z.object({
  pitId: z.string().min(1),
  keepAlive: z.string().min(2).default("2m"),
  sortValues: z.array(sortCursorValueSchema).min(1),
});

export const filterStateSchema = z.object({
  phases: z.array(z.string()).default([]),
  boroughs: z.array(z.string()).default([]),
  fundingSources: z.array(z.string()).default([]),
  budget: numericRangeSchema.optional(),
  completion: dateRangeSchema.optional(),
  updatedSince: z.string().nullable().optional(),
  hasCoordinates: z.boolean().optional(),
  geo: geoFilterSchema.optional(),
  bbox: geoBoundsSchema.optional(),
});

export const searchRequestSchema = z.object({
  query: z.string().default(""),
  mode: searchModeSchema.default("lexical"),
  searchConfig: searchConfigSchema.optional(),
  filters: filterStateSchema.default({
    phases: [],
    boroughs: [],
    fundingSources: [],
  }),
  sort: sortOptionSchema.default("relevance"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(12),
  debug: z.boolean().default(false),
  cursor: searchCursorSchema.optional(),
});

export const searchExportRequestSchema = searchRequestSchema.extend({
  exportPageSize: z.number().int().min(1).max(200).default(100),
  maxPages: z.number().int().min(1).max(25).default(5),
  closeCursor: z.boolean().default(false),
});

export type SearchMode = z.infer<typeof searchModeSchema>;
export type SearchConfigId = z.infer<typeof searchConfigSchema>;
export type SortOption = z.infer<typeof sortOptionSchema>;
export type FilterState = z.infer<typeof filterStateSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchCursor = z.infer<typeof searchCursorSchema>;
export type SearchExportRequest = z.infer<typeof searchExportRequestSchema>;

export type CompletionInput = {
  input: string | string[];
  weight?: number;
};

export type GeoBounds = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

export type GeoPoint = {
  lat: number;
  lon: number;
};

export type GeoTileBucket = {
  key: string;
  count: number;
  center: GeoPoint;
  bounds: GeoBounds;
};

export type CapitalProjectDocument = {
  project_id: string;
  fms_id: string | null;
  title: string;
  description: string;
  embedding_text: string;
  agency: string;
  phase: string;
  status: string;
  boroughs: string[];
  funding_sources: string[];
  budget_band: string;
  budget_min: number;
  budget_max: number | null;
  budget_sort: number;
  project_liaison: string | null;
  location_name: string | null;
  park_id: string | null;
  design_percent_complete: number;
  procurement_percent_complete: number;
  construction_percent_complete: number;
  overall_percent_complete: number;
  design_start: string | null;
  design_projected_completion: string | null;
  design_adjusted_completion: string | null;
  design_actual_completion: string | null;
  procurement_start: string | null;
  procurement_projected_completion: string | null;
  procurement_adjusted_completion: string | null;
  procurement_actual_completion: string | null;
  construction_start: string | null;
  construction_projected_completion: string | null;
  construction_adjusted_completion: string | null;
  construction_actual_completion: string | null;
  forecast_completion: string | null;
  last_updated: string;
  has_coordinates: boolean;
  location: { lat: number; lon: number } | null;
  tags: string[];
  source_url: string;
  source_dataset: string;
  raw_source: Record<string, unknown>;
  search_text: string;
  project_suggest: CompletionInput[] | string[];
  project_embedding?: number[];
};

export type FacetBucket = {
  value: string;
  count: number;
};

export type SearchHit = {
  id: string;
  score: number | null;
  normalizedScore: number | null;
  title: string;
  description: string;
  phase: string;
  status: string;
  boroughs: string[];
  fundingSources: string[];
  budgetBand: string;
  budgetMin: number;
  budgetMax: number | null;
  forecastCompletion: string | null;
  lastUpdated: string;
  agency: string;
  locationName: string | null;
  parkId: string | null;
  projectLiaison: string | null;
  overallPercentComplete: number;
  hasCoordinates: boolean;
  location: { lat: number; lon: number } | null;
  highlights: Record<string, string[]>;
  sortValues?: Array<string | number>;
};

export type SearchDebugPayload = {
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  warning?: string;
};

export type SearchResponse = {
  hits: SearchHit[];
  total: number;
  latencyMs: number;
  mode: SearchMode;
  searchConfig: SearchConfigId;
  facets: {
    phases: FacetBucket[];
    boroughs: FacetBucket[];
    fundingSources: FacetBucket[];
    budgetBands: FacetBucket[];
  };
  geo: {
    bounds: GeoBounds | null;
    tiles: GeoTileBucket[];
  };
  cursor?: SearchCursor | null;
  debug?: SearchDebugPayload;
};

export type SearchExportResponse = {
  hits: SearchHit[];
  total: number;
  exportedCount: number;
  latencyMs: number;
  searchConfig: SearchConfigId;
  cursor: SearchCursor | null;
  done: boolean;
};

export type SuggestionOption = {
  id: string;
  text: string;
  score: number | null;
  title: string;
  locationName: string | null;
  phase: string;
  source: "completion" | "correction";
};

export type SuggestResponse = {
  query: string;
  completion: SuggestionOption[];
  corrections: string[];
};

export type SimilarProjectsResponse = {
  source: "more_like_this" | "vector_fallback";
  hits: SearchHit[];
  latencyMs: number;
};

export type AnalyticsTimelinePoint = {
  year: string;
  totalProjects: number;
  planned: number;
  execution: number;
  completed: number;
  budgetTotal: number;
  averageCompletion: number;
};

export type AnalyticsDebugPayload = {
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  notes: string[];
};

export type AnalyticsSnapshot = {
  indexAlias: string;
  indexReady: boolean;
  generatedAt: string;
  latencyMs: number;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  planningProjects: number;
  executionProjects: number;
  geoTaggedProjects: number;
  missingForecastProjects: number;
  averageCompletion: number;
  budget: {
    sum: number;
    average: number;
    median: number;
    p90: number;
    max: number;
  };
  phaseCounts: FacetBucket[];
  boroughCounts: FacetBucket[];
  fundingCounts: FacetBucket[];
  forecastTimeline: AnalyticsTimelinePoint[];
  geo: {
    bounds: GeoBounds | null;
    tiles: GeoTileBucket[];
  };
  debug: AnalyticsDebugPayload;
};

export type ClusterStatus = {
  connected: boolean;
  clusterName: string | null;
  version: string | null;
  status: string | null;
  indexAlias: string;
  indexReady: boolean;
  documentCount: number;
  searchPipelineReady: boolean;
  rrfSearchPipelineReady: boolean;
  ingestPipelineReady: boolean;
  ollamaReachable: boolean;
  ollamaModel: string;
  error?: string;
};

export type ReindexReport = {
  indexName: string;
  alias: string;
  totalFetched: number;
  totalIndexed: number;
  embeddingDimensions: number;
  durationMs: number;
};

export const relevanceRatingSchema = z.object({
  _id: z.string().min(1),
  rating: z.number().int().min(0).max(3),
});

export const relevanceFixtureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  query: z.string().min(1),
  ratings: z.array(relevanceRatingSchema).min(1),
});

export const relevanceFixtureModeSchema = z.enum([
  "default",
  "custom",
  "combined",
]);

export const relevanceEvalRequestSchema = z.object({
  fixtureMode: relevanceFixtureModeSchema.default("default"),
  fixtures: z.array(relevanceFixtureSchema).default([]),
});

export type RelevanceFixtureMode = z.infer<typeof relevanceFixtureModeSchema>;
export type RelevanceFixture = z.infer<typeof relevanceFixtureSchema>;
export type RelevanceEvalRequest = z.infer<typeof relevanceEvalRequestSchema>;

export type RelevanceRun = {
  id: SearchConfigId;
  label: string;
  metricScore: number | null;
  queryScores: Array<{
    id: string;
    label: string;
    metricScore: number | null;
    ratings: number;
    failure?: string;
  }>;
  raw?: Record<string, unknown>;
  error?: string;
};

export type RelevanceEvalResponse = {
  generatedAt: string;
  indexAlias: string;
  fixtureMode: RelevanceFixtureMode;
  defaultFixtureCount: number;
  customFixtureCount: number;
  runs: RelevanceRun[];
  fixtures: RelevanceFixture[];
};
