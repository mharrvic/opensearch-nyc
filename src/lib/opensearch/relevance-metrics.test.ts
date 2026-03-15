import { describe, expect, it } from "vitest";

import {
  averageMetricScores,
  calculateIdealDcgAtK,
  calculateNdcgAtK,
} from "@/lib/opensearch/relevance-metrics";

describe("relevance metrics", () => {
  it("calculates the ideal DCG for a rated judgment set", () => {
    expect(calculateIdealDcgAtK([3, 2, 1], 3)).toBeCloseTo(9.3928, 4);
  });

  it("returns a perfect NDCG score for an ideal ranking", () => {
    expect(
      calculateNdcgAtK(
        ["a", "b", "c"],
        [
          { _id: "a", rating: 3 },
          { _id: "b", rating: 2 },
          { _id: "c", rating: 1 },
        ],
      ),
    ).toBeCloseTo(1, 5);
  });

  it("penalizes imperfect rankings and ignores unrated hits", () => {
    expect(
      calculateNdcgAtK(
        ["x", "b", "a", "c"],
        [
          { _id: "a", rating: 3 },
          { _id: "b", rating: 2 },
          { _id: "c", rating: 1 },
        ],
      ),
    ).toBeCloseTo(0.62, 2);
  });

  it("averages only successful metric scores", () => {
    expect(averageMetricScores([0.8, null, 0.6])).toBeCloseTo(0.7, 5);
    expect(averageMetricScores([null, null])).toBeNull();
  });
});
