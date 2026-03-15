import { describe, expect, it } from "vitest";

import { buildSearchRequestBody } from "@/lib/opensearch/search";
import type { SearchRequest } from "@/lib/types";

const baseRequest: SearchRequest = {
  query: "waterfront resiliency queens",
  mode: "lexical",
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
    expect(body.query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          { terms: { phase: ["construction"] } },
          { terms: { boroughs: ["Queens"] } },
          { term: { has_coordinates: true } },
        ]),
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
    });

    expect(body.effectiveMode).toBe("lexical");
  });

  it("builds a hybrid query when an embedding vector is provided", () => {
    const body = buildSearchRequestBody(
      {
        ...baseRequest,
        mode: "hybrid",
      },
      [0.2, 0.3, 0.4],
    );

    expect(body.effectiveMode).toBe("hybrid");
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
  });
});
