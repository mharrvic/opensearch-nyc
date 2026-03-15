import { describe, expect, it } from "vitest";

import { buildSearchRequestBody } from "@/lib/opensearch/search";
import type { SearchRequest } from "@/lib/types";

const baseRequest: SearchRequest = {
  query: "waterfront resiliency queens",
  mode: "lexical",
  searchConfig: "lexical",
  filters: {
    phases: ["construction"],
    boroughs: ["Queens"],
    fundingSources: ["City Council"],
    budget: {
      min: 5_000_000,
      max: 20_000_000,
    },
    completion: {
      from: "2026-01-01",
    },
    hasCoordinates: true,
  },
  sort: "relevance",
  page: 1,
  pageSize: 10,
  debug: true,
};

describe("search request builder", () => {
  it("builds a lexical query with filters and debug flags", () => {
    const body = buildSearchRequestBody(baseRequest);
    const lexicalShouldClauses = (
      body.query as {
        bool?: {
          must?: Array<{
            bool?: {
              should?: Array<Record<string, unknown>>;
            };
          }>;
        };
      }
    ).bool?.must?.[0]?.bool?.should;

    expect(body.effectiveMode).toBe("lexical");
    expect(body.searchConfig).toBe("lexical");
    expect(body.query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          { terms: { phase: ["construction"] } },
          { terms: { boroughs: ["Queens"] } },
          { term: { has_coordinates: true } },
        ]),
      },
    });
    expect(body.aggs).toMatchObject({
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
    });
    expect(lexicalShouldClauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          multi_match: expect.objectContaining({
            type: "bool_prefix",
            fields: expect.arrayContaining([
              "title.autocomplete^6",
              "search_text.autocomplete^2.5",
            ]),
          }),
        }),
      ]),
    );
    expect(body.profile).toBe(true);
    expect(body.highlight).toBeDefined();
  });

  it("falls back to lexical when a vector mode has no embedding vector", () => {
    const body = buildSearchRequestBody({
      ...baseRequest,
      mode: "hybrid",
      searchConfig: "hybrid",
    });

    expect(body.effectiveMode).toBe("lexical");
    expect(body.searchConfig).toBe("lexical");
  });

  it("builds a hybrid query when an embedding vector is provided", () => {
    const body = buildSearchRequestBody(
      {
        ...baseRequest,
        mode: "hybrid",
        searchConfig: "hybrid_rrf",
      },
      [0.2, 0.3, 0.4],
    );

    expect(body.effectiveMode).toBe("hybrid");
    expect(body.searchConfig).toBe("hybrid_rrf");
    expect(body.query).toMatchObject({
      bool: {
        must: [
          {
            hybrid: {
              queries: expect.any(Array),
            },
          },
        ],
      },
    });
    expect(body.profile).toBe(false);
    expect(body.explain).toBe(false);
    expect(body.pipelineId).toBe("capital-projects-hybrid-rrf-pipeline");
  });

  it("adds bounding-box filters and PIT pagination when requested", () => {
    const body = buildSearchRequestBody(
      {
        ...baseRequest,
        filters: {
          ...baseRequest.filters,
          bbox: {
            top: 40.82,
            left: -74.03,
            bottom: 40.61,
            right: -73.75,
          },
        },
      },
      undefined,
      {
        cursor: {
          pitId: "pit-123",
          keepAlive: "2m",
          sortValues: [12.5, "1023"],
        },
      },
    );

    expect(body).toMatchObject({
      size: 10,
      pit: {
        id: "pit-123",
        keep_alive: "2m",
      },
      search_after: [12.5, "1023"],
      query: {
        bool: {
          filter: expect.arrayContaining([
            {
              geo_bounding_box: {
                location: {
                  top_left: {
                    lat: 40.82,
                    lon: -74.03,
                  },
                  bottom_right: {
                    lat: 40.61,
                    lon: -73.75,
                  },
                },
              },
            },
          ]),
        },
      },
      aggs: {
        geo_tiles: {
          geotile_grid: {
            bounds: {
              top_left: {
                lat: 40.82,
                lon: -74.03,
              },
              bottom_right: {
                lat: 40.61,
                lon: -73.75,
              },
            },
          },
        },
      },
    });
    expect(body).not.toHaveProperty("from");
  });
});
