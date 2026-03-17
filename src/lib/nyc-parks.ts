import { getServerEnv } from "@/lib/env";
import type { CapitalProjectDocument } from "@/lib/types";

export type NYCParksCapitalProjectRow = {
  trackerid: string;
  fmsid?: string;
  title?: string;
  summary?: string;
  currentphase?: string;
  designpercentcomplete?: string;
  procurementpercentcomplete?: string;
  constructionpercentcomplete?: string;
  designstart?: string;
  designprojectedcompletion?: string;
  designadjustedcompletion?: string;
  designactualcompletion?: string;
  procurementstart?: string;
  procurementprojectedcompletion?: string;
  procurementadjustedcompletion?: string;
  procurementactualcompletion?: string;
  constructionstart?: string;
  constructionprojectedcom?: string;
  constructionadjustedcompletion?: string;
  constructionactualcompletion?: string;
  totalfunding?: string;
  projectliaison?: string;
  lastupdated?: string;
  fundingsource?: string;
  name?: string;
  parkid?: string;
  latitude?: string;
  longitude?: string;
  borough?: string;
};

const KNOWN_BOROUGHS = [
  "Bronx",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Staten Island",
  "Citywide",
] as const;

const KNOWN_FUNDING_SOURCES = [
  "Borough President",
  "City Council",
  "Federal",
  "Mayoral",
  "Private",
  "State",
] as const;

const SOURCE_URL =
  "https://data.cityofnewyork.us/Recreation/Capital-Project-Tracker/4hcv-tc5r";
const SOURCE_DATASET = "NYC Parks Capital Project Tracker";
const DEFAULT_DESCRIPTION = "No project summary provided.";
const DESCRIPTION_FIELD_CANDIDATES = [
  "summary",
  "description",
  "detailed_description",
  "detaileddescription",
  "project_description",
  "projectdescription",
  "scope_of_work",
  "scopeofwork",
  "work_description",
  "workdescription",
  "details",
] as const;

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value?: string | null) {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.slice(0, 10) : null;
}

function getLongestTextCandidate(
  row: Record<string, unknown>,
  fields: readonly string[],
) {
  let longestValue: string | null = null;

  for (const field of fields) {
    const value = cleanText(
      typeof row[field] === "string" ? (row[field] as string) : null,
    );

    if (value && (!longestValue || value.length > longestValue.length)) {
      longestValue = value;
    }
  }

  return longestValue;
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeToken(raw: string) {
  return raw.toLowerCase().replace(/[^a-z]/g, "");
}

function extractNamedTokens(
  rawValue: string | null,
  dictionary: readonly string[],
) {
  if (!rawValue) {
    return [];
  }

  const normalized = normalizeToken(rawValue);
  const matches = dictionary.filter((entry) =>
    normalized.includes(normalizeToken(entry)),
  );

  if (matches.length > 0) {
    return matches;
  }

  return dedupe(
    rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function parseBudgetRange(rawValue: string | null) {
  const budgetBand = rawValue ?? "Unknown";

  if (!rawValue) {
    return {
      budgetBand,
      budgetMin: 0,
      budgetMax: null as number | null,
      budgetSort: 0,
    };
  }

  const namedRanges: Record<
    string,
    { min: number; max: number | null; sort: number }
  > = {
    "Less than $1 million": {
      min: 0,
      max: 1_000_000,
      sort: 500_000,
    },
    "Between $1 million and $3 million": {
      min: 1_000_000,
      max: 3_000_000,
      sort: 2_000_000,
    },
    "Between $3 million and $5 million": {
      min: 3_000_000,
      max: 5_000_000,
      sort: 4_000_000,
    },
    "Between $5 million and $10 million": {
      min: 5_000_000,
      max: 10_000_000,
      sort: 7_500_000,
    },
    "Greater than $10 million": {
      min: 10_000_000,
      max: null,
      sort: 10_000_000,
    },
  };

  if (namedRanges[rawValue]) {
    return {
      budgetBand,
      budgetMin: namedRanges[rawValue].min,
      budgetMax: namedRanges[rawValue].max,
      budgetSort: namedRanges[rawValue].sort,
    };
  }

  const numeric = Number(rawValue.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric)) {
    return {
      budgetBand,
      budgetMin: numeric,
      budgetMax: numeric,
      budgetSort: numeric,
    };
  }

  return {
    budgetBand,
    budgetMin: 0,
    budgetMax: null,
    budgetSort: 0,
  };
}

function buildForecastCompletion(row: NYCParksCapitalProjectRow, phase: string) {
  const upcomingMilestones =
    phase === "completed"
      ? [
          parseDate(row.constructionactualcompletion),
          parseDate(row.procurementactualcompletion),
          parseDate(row.designactualcompletion),
        ]
      : [
          parseDate(row.constructionadjustedcompletion),
          parseDate(row.constructionprojectedcom),
          parseDate(row.procurementadjustedcompletion),
          parseDate(row.procurementprojectedcompletion),
          parseDate(row.designadjustedcompletion),
          parseDate(row.designprojectedcompletion),
          parseDate(row.constructionactualcompletion),
          parseDate(row.procurementactualcompletion),
          parseDate(row.designactualcompletion),
        ];

  return upcomingMilestones.find(Boolean) ?? null;
}

function buildDescription(row: NYCParksCapitalProjectRow) {
  return (
    getLongestTextCandidate(
      row as Record<string, unknown>,
      DESCRIPTION_FIELD_CANDIDATES,
    ) ?? DEFAULT_DESCRIPTION
  );
}

function buildSearchText(
  project: Omit<
    CapitalProjectDocument,
    "embedding_text" | "search_text" | "project_suggest"
  >,
) {
  return dedupe([
    project.title,
    project.description,
    project.location_name ?? "",
    project.phase,
    project.status,
    project.agency,
    project.project_liaison ?? "",
    project.park_id ?? "",
    project.budget_band,
    ...project.boroughs,
    ...project.funding_sources,
    ...project.tags,
  ])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmbeddingText(
  project: Pick<CapitalProjectDocument, "title" | "description">,
) {
  const embeddingSegments = [
    project.title,
    project.description === DEFAULT_DESCRIPTION ? "" : project.description,
  ];

  return dedupe(embeddingSegments)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSuggestionInputs(
  project: Omit<
    CapitalProjectDocument,
    "embedding_text" | "search_text" | "project_suggest"
  >,
) {
  const suggestions = dedupe([
    project.title,
    project.location_name ?? "",
    `${project.title} ${project.boroughs[0] ?? ""}`.trim(),
    `${project.location_name ?? ""} ${project.boroughs[0] ?? ""}`.trim(),
    project.park_id ?? "",
  ]);

  return suggestions.map((input, index) => ({
    input,
    weight: Math.max(1, 12 - index * 2),
  }));
}

export function normalizeCapitalProject(
  row: NYCParksCapitalProjectRow,
): CapitalProjectDocument {
  const phase = cleanText(row.currentphase)?.toLowerCase() ?? "unknown";
  const description = buildDescription(row);
  const budget = parseBudgetRange(cleanText(row.totalfunding));
  const latitude = parseNumber(row.latitude);
  const longitude = parseNumber(row.longitude);
  const hasCoordinates = latitude !== 0 && longitude !== 0;
  const boroughs = extractNamedTokens(cleanText(row.borough), KNOWN_BOROUGHS);
  const fundingSources = extractNamedTokens(
    cleanText(row.fundingsource),
    KNOWN_FUNDING_SOURCES,
  );
  const baseDocument: Omit<
    CapitalProjectDocument,
    "embedding_text" | "search_text" | "project_suggest"
  > = {
    project_id: row.trackerid,
    fms_id: cleanText(row.fmsid),
    title: cleanText(row.title) ?? `Capital Project ${row.trackerid}`,
    description,
    agency: "nyc parks",
    phase,
    status: phase,
    boroughs,
    funding_sources: fundingSources,
    budget_band: budget.budgetBand,
    budget_min: budget.budgetMin,
    budget_max: budget.budgetMax,
    budget_sort: budget.budgetSort,
    project_liaison: cleanText(row.projectliaison),
    location_name: cleanText(row.name),
    park_id: cleanText(row.parkid),
    design_percent_complete: parseNumber(row.designpercentcomplete),
    procurement_percent_complete: parseNumber(row.procurementpercentcomplete),
    construction_percent_complete: parseNumber(row.constructionpercentcomplete),
    overall_percent_complete: Math.max(
      parseNumber(row.designpercentcomplete),
      parseNumber(row.procurementpercentcomplete),
      parseNumber(row.constructionpercentcomplete),
    ),
    design_start: parseDate(row.designstart),
    design_projected_completion: parseDate(row.designprojectedcompletion),
    design_adjusted_completion: parseDate(row.designadjustedcompletion),
    design_actual_completion: parseDate(row.designactualcompletion),
    procurement_start: parseDate(row.procurementstart),
    procurement_projected_completion: parseDate(
      row.procurementprojectedcompletion,
    ),
    procurement_adjusted_completion: parseDate(
      row.procurementadjustedcompletion,
    ),
    procurement_actual_completion: parseDate(row.procurementactualcompletion),
    construction_start: parseDate(row.constructionstart),
    construction_projected_completion: parseDate(row.constructionprojectedcom),
    construction_adjusted_completion: parseDate(
      row.constructionadjustedcompletion,
    ),
    construction_actual_completion: parseDate(row.constructionactualcompletion),
    forecast_completion: buildForecastCompletion(row, phase),
    last_updated: parseDate(row.lastupdated) ?? new Date().toISOString().slice(0, 10),
    has_coordinates: hasCoordinates,
    location: hasCoordinates ? { lat: latitude, lon: longitude } : null,
    tags: dedupe([
      phase,
      "capital project",
      "parks",
      ...boroughs,
      ...fundingSources,
    ]),
    source_url: SOURCE_URL,
    source_dataset: SOURCE_DATASET,
    raw_source: row,
  };

  return {
    ...baseDocument,
    embedding_text: buildEmbeddingText(baseDocument),
    search_text: buildSearchText(baseDocument),
    project_suggest: buildSuggestionInputs(baseDocument),
  };
}

export async function fetchCapitalProjects(limit?: number) {
  const env = getServerEnv();
  const rows: NYCParksCapitalProjectRow[] = [];
  const pageSize = env.NYC_CAPITAL_PROJECTS_PAGE_SIZE;
  let offset = 0;

  while (true) {
    const pageLimit =
      typeof limit === "number"
        ? Math.min(pageSize, Math.max(limit - rows.length, 0))
        : pageSize;

    if (pageLimit === 0) {
      break;
    }

    const url = new URL(env.NYC_CAPITAL_PROJECTS_URL);
    url.searchParams.set("$limit", String(pageLimit));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$order", "trackerid ASC");

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Dataset request failed with ${response.status}`);
    }

    const page = (await response.json()) as NYCParksCapitalProjectRow[];
    rows.push(...page);

    if (page.length < pageLimit || (limit && rows.length >= limit)) {
      break;
    }

    offset += page.length;
  }

  return rows.slice(0, limit);
}

export const nycParksTestUtils = {
  extractNamedTokens,
  parseBudgetRange,
};
