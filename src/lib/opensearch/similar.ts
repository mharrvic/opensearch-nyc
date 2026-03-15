import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient } from "@/lib/opensearch/client";
import { getAliasIndices } from "@/lib/opensearch/schema";
import { getProjectById, mapSearchHit } from "@/lib/opensearch/search";
import type { CapitalProjectDocument, SimilarProjectsResponse } from "@/lib/types";

type SearchResponseBody = {
  took?: number;
  hits?: {
    hits?: Array<{
      _id: string;
      _score?: number | string | null;
      _source?: CapitalProjectDocument;
      highlight?: Record<string, string[]>;
      sort?: Array<string | number>;
    }>;
  };
};

export async function getSimilarProjects(
  projectId: string,
  limit = 5,
): Promise<SimilarProjectsResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return {
      source: "more_like_this",
      hits: [],
      latencyMs: 0,
    };
  }

  const response = await client.search({
    index: env.OPENSEARCH_INDEX_ALIAS,
    body: {
      size: limit,
      query: {
        bool: {
          must: [
            {
              more_like_this: {
                fields: ["title", "description", "search_text"],
                like: [
                  {
                    _index: env.OPENSEARCH_INDEX_ALIAS,
                    _id: projectId,
                  },
                ],
                min_term_freq: 1,
                min_doc_freq: 1,
                min_word_length: 3,
                max_query_terms: 25,
              },
            },
          ],
          must_not: [
            {
              term: {
                project_id: projectId,
              },
            },
          ],
        },
      },
      sort: [{ _score: "desc" }, { project_id: "asc" }],
      _source: true,
    } as never,
  } as never);
  const body = response.body as SearchResponseBody;
  const moreLikeThisHits = (body.hits?.hits ?? []).map(mapSearchHit);

  if (moreLikeThisHits.length > 0) {
    return {
      source: "more_like_this",
      hits: moreLikeThisHits,
      latencyMs: body.took ?? 0,
    };
  }

  const project = await getProjectById(projectId);

  if (!project?.project_embedding) {
    return {
      source: "more_like_this",
      hits: [],
      latencyMs: body.took ?? 0,
    };
  }

  const vectorResponse = await client.search({
    index: env.OPENSEARCH_INDEX_ALIAS,
    body: {
      size: limit,
      query: {
        knn: {
          project_embedding: {
            vector: project.project_embedding,
            k: Math.max(limit * 3, 30),
            filter: {
              bool: {
                must_not: [
                  {
                    term: {
                      project_id: projectId,
                    },
                  },
                ],
              },
            },
          },
        },
      },
      sort: [{ _score: "desc" }, { project_id: "asc" }],
      _source: true,
    } as never,
  } as never);
  const vectorBody = vectorResponse.body as SearchResponseBody;

  return {
    source: "vector_fallback",
    hits: (vectorBody.hits?.hits ?? []).map(mapSearchHit),
    latencyMs: vectorBody.took ?? 0,
  };
}
