import type { RelevanceFixture } from "@/lib/types";

function calculateGain(rating: number) {
  return 2 ** rating - 1;
}

function calculateDiscount(position: number) {
  return Math.log2(position + 2);
}

export function calculateDcgAtK(
  rankedIds: string[],
  ratingMap: Map<string, number>,
  k = 10,
) {
  let score = 0;

  for (let index = 0; index < Math.min(k, rankedIds.length); index += 1) {
    const rating = ratingMap.get(rankedIds[index]) ?? 0;
    score += calculateGain(rating) / calculateDiscount(index);
  }

  return score;
}

export function calculateIdealDcgAtK(ratings: number[], k = 10) {
  return ratings
    .toSorted((left, right) => right - left)
    .slice(0, k)
    .reduce(
      (score, rating, index) =>
        score + calculateGain(rating) / calculateDiscount(index),
      0,
    );
}

export function calculateNdcgAtK(
  rankedIds: string[],
  ratings: RelevanceFixture["ratings"],
  k = 10,
) {
  const ratingMap = new Map(ratings.map((rating) => [rating._id, rating.rating]));
  const idealScore = calculateIdealDcgAtK(
    ratings.map((rating) => rating.rating),
    k,
  );

  if (idealScore === 0) {
    return null;
  }

  return calculateDcgAtK(rankedIds, ratingMap, k) / idealScore;
}

export function averageMetricScores(scores: Array<number | null>) {
  const validScores = scores.filter(
    (score): score is number => typeof score === "number" && Number.isFinite(score),
  );

  if (validScores.length === 0) {
    return null;
  }

  return (
    validScores.reduce((sum, score) => sum + score, 0) / validScores.length
  );
}
