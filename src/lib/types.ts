import { z } from "zod";

export const searchModeSchema = z.enum(["lexical", "vector", "hybrid"]);
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

export const filterStateSchema = z.object({
  phases: z.array(z.string()).default([]),
  boroughs: z.array(z.string()).default([]),
  fundingSources: z.array(z.string()).default([]),
  budget: numericRangeSchema.optional(),
  completion: dateRangeSchema.optional(),
  updatedSince: z.string().nullable().optional(),
  hasCoordinates: z.boolean().optional(),
  geo: geoFilterSchema.optional(),
});

export const searchRequestSchema = z.object({
  query: z.string().default(""),
  mode: searchModeSchema.default("lexical"),
  filters: filterStateSchema.default({
    phases: [],
    boroughs: [],
    fundingSources: [],
  }),
  sort: sortOptionSchema.default("relevance"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(12),
  debug: z.boolean().default(false),
});

export type SearchMode = z.infer<typeof searchModeSchema>;
export type SortOption = z.infer<typeof sortOptionSchema>;
export type FilterState = z.infer<typeof filterStateSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type CapitalProjectDocument = {
  project_id: string;
  fms_id: string | null;
  title: string;
  description: string;
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
  project_embedding?: number[];
};

export type FacetBucket = {
  value: string;
  count: number;
};

export type SearchHit = {
  id: string;
  score: number | null;
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
  facets: {
    phases: FacetBucket[];
    boroughs: FacetBucket[];
    fundingSources: FacetBucket[];
    budgetBands: FacetBucket[];
  };
  debug?: SearchDebugPayload;
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
