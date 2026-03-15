import type { Metadata } from "next";

import { AnalyticsDashboard } from "@/components/app/analytics-dashboard";
import { getServerEnv } from "@/lib/env";
import {
  createEmptyAnalyticsSnapshot,
  getAnalyticsSnapshot,
} from "@/lib/opensearch/analytics";

export const metadata: Metadata = {
  title: "Analytics | OpenSearch Research Sandbox",
  description:
    "Explore OpenSearch aggregations and program-level analytics for the seeded capital-project dataset.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const env = getServerEnv();
  const snapshot = await getAnalyticsSnapshot().catch((error) =>
    createEmptyAnalyticsSnapshot(env.OPENSEARCH_INDEX_ALIAS, {
      notes: [
        error instanceof Error
          ? error.message
          : "Analytics are currently unavailable.",
      ],
    }),
  );

  return <AnalyticsDashboard initialSnapshot={snapshot} />;
}
