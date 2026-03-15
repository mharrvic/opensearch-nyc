import { describe, expect, it } from "vitest";

import {
  getRelevanceFixturesForMode,
  mergeRelevanceFixtures,
} from "@/lib/opensearch/relevance-fixture-utils";
import { relevanceFixtures } from "@/lib/opensearch/relevance-fixtures";
import type { RelevanceFixture } from "@/lib/types";

const customFixtures: RelevanceFixture[] = [
  {
    id: "custom-waterfront",
    label: "Custom waterfront",
    query: "custom waterfront",
    ratings: [{ _id: "1", rating: 3 }],
  },
];

describe("relevance fixture helpers", () => {
  it("returns repo defaults for default mode", () => {
    expect(getRelevanceFixturesForMode("default", customFixtures)).toEqual(
      relevanceFixtures,
    );
  });

  it("returns only custom fixtures for custom mode", () => {
    expect(getRelevanceFixturesForMode("custom", customFixtures)).toEqual(
      customFixtures,
    );
  });

  it("merges default and custom fixtures for combined mode", () => {
    expect(getRelevanceFixturesForMode("combined", customFixtures)).toEqual([
      ...relevanceFixtures,
      ...customFixtures,
    ]);
  });

  it("lets custom fixtures override duplicate ids when merging", () => {
    const duplicate: RelevanceFixture[] = [
      {
        ...relevanceFixtures[0],
        label: "Overridden fixture",
      },
    ];

    expect(mergeRelevanceFixtures(relevanceFixtures, duplicate)[0]?.label).toBe(
      "Overridden fixture",
    );
  });
});
