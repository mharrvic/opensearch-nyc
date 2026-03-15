import { getServerEnv } from "@/lib/env";
import { getOpenSearchClient } from "@/lib/opensearch/client";
import { getAliasIndices } from "@/lib/opensearch/schema";
import type { CapitalProjectDocument, SuggestResponse, SuggestionOption } from "@/lib/types";

type SuggestResponseBody = {
  suggest?: {
    project_completion?: Array<{
      options?: SuggestCompletionOption[];
    }>;
    spelling?: Array<{
      options?: Array<{
        text?: string;
      }>;
    }>;
  };
};

type SuggestCompletionOption = {
  text?: string;
  _id?: string;
  _score?: number | string | null;
  _source?: Pick<CapitalProjectDocument, "title" | "location_name" | "phase">;
};

function normalizeSuggestionOption(
  option: SuggestCompletionOption,
): SuggestionOption | null {
  const text = option.text?.trim();
  const id = option._id?.trim();

  if (!text || !id) {
    return null;
  }

  const numericScore =
    typeof option._score === "number"
      ? option._score
      : typeof option._score === "string"
        ? Number(option._score)
        : null;

  return {
    id,
    text,
    score: Number.isFinite(numericScore) ? numericScore : null,
    title: option._source?.title ?? text,
    locationName: option._source?.location_name ?? null,
    phase: option._source?.phase ?? "unknown",
    source: "completion",
  };
}

export async function getSuggestions(query: string): Promise<SuggestResponse> {
  const env = getServerEnv();
  const client = getOpenSearchClient();
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return {
      query,
      completion: [],
      corrections: [],
    };
  }

  const aliasIndices = await getAliasIndices(client, env.OPENSEARCH_INDEX_ALIAS);

  if (aliasIndices.length === 0) {
    return {
      query,
      completion: [],
      corrections: [],
    };
  }

  const response = await client.search({
    index: env.OPENSEARCH_INDEX_ALIAS,
    body: {
      _source: ["title", "location_name", "phase", "project_suggest"],
      size: 0,
      suggest: {
        project_completion: {
          prefix: trimmedQuery,
          completion: {
            field: "project_suggest",
            size: 6,
            skip_duplicates: true,
            fuzzy: {
              fuzziness: "AUTO",
              min_length: 3,
              prefix_length: 1,
            },
          },
        },
        spelling: {
          text: trimmedQuery,
          term: {
            field: "search_text",
            suggest_mode: "popular",
            min_word_length: 4,
            size: 3,
          },
        },
      },
    } as never,
  } as never);
  const body = response.body as SuggestResponseBody;
  const completion = (
    body.suggest?.project_completion?.flatMap((entry) => entry.options ?? []) ?? []
  )
    .map(normalizeSuggestionOption)
    .filter((value): value is SuggestionOption => value !== null);
  const corrections = [
    ...new Set(
      (
        body.suggest?.spelling?.flatMap((entry) => entry.options ?? []) ?? []
      )
        .map((option) => option.text?.trim())
        .filter(
          (value): value is string =>
            value !== undefined &&
            value.toLowerCase() !== trimmedQuery.toLowerCase(),
        ),
    ),
  ];

  return {
    query,
    completion,
    corrections,
  };
}
