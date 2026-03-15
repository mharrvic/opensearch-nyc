import { z } from "zod";

const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return false;
}, z.boolean());

const numberish = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }

  return undefined;
}, z.number().int().positive());

const serverEnvSchema = z.object({
  OPENSEARCH_NODE: z.string().url().default("https://localhost:9200"),
  OPENSEARCH_USERNAME: z.string().default("admin"),
  OPENSEARCH_PASSWORD: z.string().min(1).default("SearchLab#2026!"),
  OPENSEARCH_INDEX_ALIAS: z.string().default("capital-projects-current"),
  OPENSEARCH_REJECT_UNAUTHORIZED: booleanish.default(false),
  OPENSEARCH_SEARCH_PIPELINE: z.string().default("capital-projects-hybrid-pipeline"),
  OPENSEARCH_RRF_SEARCH_PIPELINE: z
    .string()
    .default("capital-projects-hybrid-rrf-pipeline"),
  OPENSEARCH_INGEST_PIPELINE: z.string().default("capital-projects-normalize"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_EMBED_MODEL: z.string().default("qwen3-embedding:0.6b"),
  NYC_CAPITAL_PROJECTS_URL: z
    .string()
    .url()
    .default("https://data.cityofnewyork.us/resource/4hcv-tc5r.json"),
  NYC_CAPITAL_PROJECTS_PAGE_SIZE: numberish.default(1000),
  NEXT_PUBLIC_APP_TITLE: z.string().default("OpenSearch Research Sandbox"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = serverEnvSchema.parse(process.env);
  return cachedEnv;
}
