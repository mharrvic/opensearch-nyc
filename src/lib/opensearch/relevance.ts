import { embedTexts } from "@/lib/ollama";
import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient } from "@/lib/opensearch/client";
import { relevanceFixtures } from "@/lib/opensearch/relevance-fixtures";
import { getRelevanceFixturesForMode } from "@/lib/opensearch/relevance-fixture-utils";
import {
  averageMetricScores,
  calculateNdcgAtK,
} from "@/lib/opensearch/relevance-metrics";
import {
  getSearchConfig,
  type SearchConfigDefinition,
} from "@/lib/opensearch/search-config";
import { buildSearchRequestBody } from "@/lib/opensearch/search";
import { ensurePipelines, getAliasIndices } from "@/lib/opensearch/schema";
import type {
  RelevanceEvalResponse,
  RelevanceFixtureMode,
  RelevanceFixture,
  RelevanceRun,
  SearchConfigId,
  SearchRequest,
} from "@/lib/types";

type SearchResponseBody = {
  hits?: {
    hits?: Array<{
      _id: string;
    }>;
  };
};

const relevanceConfigIds: SearchConfigId[] = ["lexical", "hybrid", "hybrid_rrf"];

function createBaseSearchRequest(query: string, searchConfig: SearchConfigId): SearchRequest {
  return {
    query,
    mode: getSearchConfig(searchConfig).mode,
    searchConfig,
    filters: {
      phases: [],
      boroughs: [],
      fundingSources: [],
    },
    sort: "relevance",
    page: 1,
    pageSize: 10,
    debug: false,
  };
}

function createEmptyRun(config: SearchConfigDefinition, fixtures: RelevanceFixture[]): RelevanceRun {
  return {
    id: config.id,
    label: config.label,
    metricScore: null,
    queryScores: fixtures.map((fixture) => ({
      id: fixture.id,
      label: fixture.label,
      metricScore: null,
      ratings: fixture.ratings.length,
    })),
  };
}

async function runRankEval(
  configId: SearchConfigId,
  fixtures: RelevanceFixture[],
  queryVectors: Map<string, number[]>,
): Promise<RelevanceRun> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const config = getSearchConfig(configId);
  const requests = fixtures.map((fixture) => {
    const requestBody = buildSearchRequestBody(
      createBaseSearchRequest(fixture.query, configId),
      queryVectors.get(fixture.query),
      {
        includeAggregations: false,
        includeHighlights: false,
      },
    );
    const request = { ...requestBody } as Record<string, unknown>;
    const pipelineId =
      typeof request.pipelineId === "string" ? request.pipelineId : undefined;
    delete request.pipelineId;
    delete request.effectiveMode;
    delete request.searchConfig;
    delete request.sort;

    return {
      id: fixture.id,
      request,
      pipelineId,
      ratings: fixture.ratings,
    };
  });
  const queryScores = await Promise.all(
    requests.map(async ({ id, request, pipelineId, ratings }) => {
      const fixture = fixtures.find((item) => item.id === id);

      if (!fixture) {
        return {
          id,
          label: id,
          metricScore: null,
          ratings: ratings.length,
          failure: "Missing fixture metadata for evaluation query.",
        };
      }

      try {
        const response = await client.search({
          index: env.OPENSEARCH_INDEX_ALIAS,
          body: request as never,
          ...(pipelineId
            ? {
                search_pipeline: pipelineId,
              }
            : {}),
        } as never);
        const rankedIds =
          ((response.body as SearchResponseBody).hits?.hits ?? []).map((hit) =>
            String(hit._id),
          );

        return {
          id: fixture.id,
          label: fixture.label,
          metricScore: calculateNdcgAtK(rankedIds, ratings),
          ratings: ratings.length,
        };
      } catch (error) {
        return {
          id: fixture.id,
          label: fixture.label,
          metricScore: null,
          ratings: ratings.length,
          failure:
            error instanceof Error ? error.message : "Rank evaluation failed.",
        };
      }
    }),
  );
  const failures = queryScores.filter((score) => score.failure);

  return {
    id: config.id,
    label: config.label,
    metricScore: averageMetricScores(queryScores.map((score) => score.metricScore)),
    queryScores,
    raw: {
      method: "local_ndcg_at_10",
      searchConfig: config.id,
    },
    error:
      failures.length > 0
        ? failures.map((score) => `${score.label}: ${score.failure}`).join(" ")
        : undefined,
  };
}

export async function evaluateRelevance(options?: {
  fixtureMode?: RelevanceFixtureMode;
  fixtures?: RelevanceFixture[];
}): Promise<RelevanceEvalResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const fixtureMode = options?.fixtureMode ?? "default";
  const customFixtures = options?.fixtures ?? [];
  const activeFixtures = getRelevanceFixturesForMode(fixtureMode, customFixtures);
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (activeFixtures.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      indexAlias: env.OPENSEARCH_INDEX_ALIAS,
      fixtureMode,
      defaultFixtureCount: relevanceFixtures.length,
      customFixtureCount: customFixtures.length,
      runs: relevanceConfigIds.map((configId) =>
        createEmptyRun(getSearchConfig(configId), activeFixtures),
      ),
      fixtures: activeFixtures,
    };
  }

  if (aliasIndices.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      indexAlias: env.OPENSEARCH_INDEX_ALIAS,
      fixtureMode,
      defaultFixtureCount: relevanceFixtures.length,
      customFixtureCount: customFixtures.length,
      runs: relevanceConfigIds.map((configId) =>
        createEmptyRun(getSearchConfig(configId), activeFixtures),
      ),
      fixtures: activeFixtures,
    };
  }

  try {
    await ensurePipelines(client);
  } catch {
    // Continue and let per-run errors surface if the cluster cannot create pipelines.
  }

  const vectorEligibleFixtures =
    relevanceConfigIds.some((configId) => getSearchConfig(configId).mode !== "lexical")
      ? activeFixtures
      : [];
  const embeddings =
    vectorEligibleFixtures.length > 0
      ? await embedTexts(vectorEligibleFixtures.map((fixture) => fixture.query))
      : [];
  const queryVectors = new Map<string, number[]>();

  for (let index = 0; index < vectorEligibleFixtures.length; index += 1) {
    const fixture = vectorEligibleFixtures[index];
    const vector = embeddings[index];

    if (fixture && vector) {
      queryVectors.set(fixture.query, vector);
    }
  }

  const runs = await Promise.all(
    relevanceConfigIds.map((configId) =>
      runRankEval(configId, activeFixtures, queryVectors),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    indexAlias: env.OPENSEARCH_INDEX_ALIAS,
    fixtureMode,
    defaultFixtureCount: relevanceFixtures.length,
    customFixtureCount: customFixtures.length,
    runs,
    fixtures: activeFixtures,
  };
}
