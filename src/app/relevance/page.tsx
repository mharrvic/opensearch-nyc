import type { Metadata } from "next";

import { RelevanceLab } from "@/components/app/relevance-lab";
import { getServerEnv } from "@/lib/env";
import { relevanceFixtures } from "@/lib/opensearch/relevance-fixtures";
import { evaluateRelevance } from "@/lib/opensearch/relevance";

export const metadata: Metadata = {
  title: "Relevance | OpenSearch Research Sandbox",
  description:
    "Evaluate lexical, hybrid, and RRF hybrid OpenSearch retrieval against the repo-managed capital-project judgment set.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RelevancePage() {
  const env = getServerEnv();
  const evaluation = await evaluateRelevance().catch(() => ({
    generatedAt: new Date().toISOString(),
    indexAlias: env.OPENSEARCH_INDEX_ALIAS,
    fixtureMode: "default" as const,
    defaultFixtureCount: relevanceFixtures.length,
    customFixtureCount: 0,
    runs: [],
    fixtures: relevanceFixtures,
  }));

  return (
    <RelevanceLab
      defaultFixtures={relevanceFixtures}
      initialEvaluation={evaluation}
    />
  );
}
