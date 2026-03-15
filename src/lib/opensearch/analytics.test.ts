import { describe, expect, it } from "vitest";

import type { AnalyticsFilter } from "@/lib/analytics-filters";
import {
  buildAnalyticsRequestBody,
  createEmptyAnalyticsSnapshot,
} from "@/lib/opensearch/analytics";

describe("analytics request builder", () => {
  it("builds an aggregation-first analytics query", () => {
    const body = buildAnalyticsRequestBody();

    expect(body).toMatchObject({
      size: 0,
      track_total_hits: true,
      aggs: {
        budget_stats: {
          stats: {
            field: "budget_sort",
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
            },
          },
        },
        forecast_timeline: {
          date_histogram: {
            field: "forecast_completion",
            calendar_interval: "year",
          },
        },
        geo_bounds: {
          geo_bounds: {
            field: "location",
          },
        },
        geo_tiles: {
          geotile_grid: {
            field: "location",
            precision: 7,
          },
        },
      },
    });
  });

  it("translates mixed filters into the OpenSearch query root", () => {
    const filters: AnalyticsFilter[] = [
      {
        id: "phase-1",
        type: "options",
        field: "phase",
        operator: "any_of",
        values: ["construction", "design"],
      },
      {
        id: "budget-1",
        type: "number",
        field: "budget_sort",
        operator: "gte",
        value: 10_000_000,
      },
      {
        id: "date-1",
        type: "date",
        field: "forecast_completion",
        operator: "on_or_after",
        value: "2027-01-01",
      },
      {
        id: "title-1",
        type: "string",
        field: "title",
        operator: "contains",
        value: "playground",
      },
    ];
    const body = buildAnalyticsRequestBody(filters);

    expect(body.query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          {
            terms: {
              phase: ["construction", "design"],
            },
          },
          {
            range: {
              budget_sort: {
                gte: 10_000_000,
              },
            },
          },
          {
            range: {
              forecast_completion: {
                gte: "2027-01-01",
              },
            },
          },
          {
            wildcard: {
              "title.keyword": {
                value: "*playground*",
              },
            },
          },
        ]),
      },
    });
  });

  it("supports null and exclusion operators for analytics filters", () => {
    const filters: AnalyticsFilter[] = [
      {
        id: "funding-1",
        type: "options",
        field: "funding_sources",
        operator: "none_of",
        values: ["private"],
      },
      {
        id: "forecast-1",
        type: "date",
        field: "forecast_completion",
        operator: "is_not_null",
      },
      {
        id: "geo-1",
        type: "boolean",
        field: "has_coordinates",
        operator: "is",
        value: true,
      },
    ];
    const body = buildAnalyticsRequestBody(filters);

    expect(body.query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          {
            bool: {
              must_not: [
                {
                  terms: {
                    funding_sources: ["private"],
                  },
                },
              ],
            },
          },
          {
            exists: {
              field: "forecast_completion",
            },
          },
          {
            term: {
              has_coordinates: true,
            },
          },
        ]),
      },
    });
  });

  it("creates a zeroed snapshot when the alias is not ready", () => {
    const snapshot = createEmptyAnalyticsSnapshot("capital-projects-current", {
      notes: ["Run the seed workflow first."],
    });

    expect(snapshot.indexReady).toBe(false);
    expect(snapshot.totalProjects).toBe(0);
    expect(snapshot.geo.bounds).toBeNull();
    expect(snapshot.geo.tiles).toEqual([]);
    expect(snapshot.debug.notes).toContain("Run the seed workflow first.");
  });
});
