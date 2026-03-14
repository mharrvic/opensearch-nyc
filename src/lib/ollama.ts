import { getServerEnv } from "@/lib/env";

type OllamaTagsResponse = {
  models?: Array<{ name: string }>;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
};

async function callOllama<T>(path: string, init?: RequestInit) {
  const env = getServerEnv();
  const response = await fetch(`${env.OLLAMA_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function embedTexts(texts: string[]) {
  if (texts.length === 0) {
    return [];
  }

  const env = getServerEnv();
  const payload = await callOllama<OllamaEmbedResponse>("/api/embed", {
    method: "POST",
    body: JSON.stringify({
      model: env.OLLAMA_EMBED_MODEL,
      input: texts,
    }),
  });

  if (Array.isArray(payload.embeddings)) {
    return payload.embeddings;
  }

  if (Array.isArray(payload.embedding)) {
    return [payload.embedding];
  }

  throw new Error("Ollama embed response did not include embeddings.");
}

export async function probeEmbeddingDimension(sample: string) {
  const embeddings = await embedTexts([sample]);
  const dimension = embeddings[0]?.length ?? 0;

  if (!dimension) {
    throw new Error("Unable to determine embedding dimension from Ollama.");
  }

  return dimension;
}

export async function getOllamaStatus() {
  try {
    const payload = await callOllama<OllamaTagsResponse>("/api/tags", {
      method: "GET",
    });

    const env = getServerEnv();
    const modelAvailable =
      payload.models?.some((model) => model.name === env.OLLAMA_EMBED_MODEL) ??
      false;

    return {
      reachable: true,
      modelAvailable,
    };
  } catch {
    return {
      reachable: false,
      modelAvailable: false,
    };
  }
}
