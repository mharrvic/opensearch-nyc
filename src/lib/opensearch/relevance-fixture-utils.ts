import { relevanceFixtures } from "@/lib/opensearch/relevance-fixtures";
import type { RelevanceFixture, RelevanceFixtureMode } from "@/lib/types";

export function mergeRelevanceFixtures(
  defaultFixtures: RelevanceFixture[],
  customFixtures: RelevanceFixture[],
) {
  const merged = new Map<string, RelevanceFixture>();

  for (const fixture of [...defaultFixtures, ...customFixtures]) {
    merged.set(fixture.id, fixture);
  }

  return Array.from(merged.values());
}

export function getRelevanceFixturesForMode(
  fixtureMode: RelevanceFixtureMode,
  customFixtures: RelevanceFixture[],
  defaultFixtures: RelevanceFixture[] = relevanceFixtures,
) {
  switch (fixtureMode) {
    case "custom":
      return customFixtures;
    case "combined":
      return mergeRelevanceFixtures(defaultFixtures, customFixtures);
    case "default":
    default:
      return defaultFixtures;
  }
}
