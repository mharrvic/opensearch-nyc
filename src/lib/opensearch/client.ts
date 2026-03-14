import { Client } from "@opensearch-project/opensearch";

import { getServerEnv } from "@/lib/env";

declare global {
  var __opensearchClient__: Client | undefined;
}

export function getOpenSearchClient() {
  if (globalThis.__opensearchClient__) {
    return globalThis.__opensearchClient__;
  }

  const env = getServerEnv();

  globalThis.__opensearchClient__ = new Client({
    node: env.OPENSEARCH_NODE,
    auth: {
      username: env.OPENSEARCH_USERNAME,
      password: env.OPENSEARCH_PASSWORD,
    },
    ssl: {
      rejectUnauthorized: env.OPENSEARCH_REJECT_UNAUTHORIZED,
    },
  });

  return globalThis.__opensearchClient__;
}

export function isIndexMissingError(error: unknown) {
  const type = (error as { meta?: { body?: { error?: { type?: string } } } })?.meta
    ?.body?.error?.type;
  return type === "index_not_found_exception";
}

export function serializeOpenSearchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown OpenSearch error";
}
