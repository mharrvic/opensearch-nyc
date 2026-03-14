# OpenSearch Research Sandbox

A local research workbench for learning OpenSearch against a real public dataset. The stack combines:

- OpenSearch + OpenSearch Dashboards in Docker Compose
- Next.js 16 + TypeScript + Tailwind + `shadcn/ui`
- Host Ollama embeddings with `qwen3-embedding:0.6b`
- NYC Parks Capital Project Tracker data from NYC Open Data

The app is intentionally research-first rather than product-polished. It exposes lexical, vector, and hybrid search, advanced filters, aggregations, raw DSL inspection, and reindex controls from one dashboard.

## What is included

- Secure local OpenSearch with the Security plugin enabled
- Versioned index creation plus alias switching
- Ingest pipeline for normalization and ingest timestamps
- Hybrid search pipeline using the OpenSearch normalization processor
- Dataset normalization for phase, funding, budget ranges, boroughs, dates, and geo coordinates
- `/api/search`, `/api/projects/[id]`, `/api/admin/reindex`, and `/api/admin/cluster`
- A `shadcn/ui` dashboard with filters, result list, debug tabs, and a detail drawer

## Quick start

Run the stack in this order:

1. Install dependencies and create `.env`
2. Start Ollama on the host
3. Pull the embedding model
4. Start Docker Compose
5. Seed the public dataset

## Step-by-step commands

Use three terminals.

### Terminal 0: one-time setup

```bash
cd /Users/mharvicchicano/projects/experimentations/opensearch
cp .env.example .env
pnpm install
```

The project uses `.env` for Docker Compose, the CLI seed script, and local Next.js development.

### Terminal 1: start Ollama

```bash
ollama serve
```

Leave this terminal running.

### Terminal 2: pull the embedding model

```bash
ollama pull qwen3-embedding:0.6b
```

You only need to pull the model once.

### Terminal 3: start the Docker stack

```bash
cd /Users/mharvicchicano/projects/experimentations/opensearch
pnpm docker:up
```

This starts:

- OpenSearch on `https://localhost:9200`
- OpenSearch Dashboards on `http://localhost:5601`
- Next.js app on `http://localhost:3000`

### Terminal 4: seed the public dataset

```bash
cd /Users/mharvicchicano/projects/experimentations/opensearch
pnpm seed
```

This will:

- fetch the NYC Parks public dataset
- create a versioned OpenSearch index
- create the ingest and hybrid search pipelines
- generate embeddings through Ollama
- bulk index the normalized capital project documents
- repoint the alias `capital-projects-current`

### Open the app

- App: `http://localhost:3000`
- OpenSearch: `https://localhost:9200`
- Dashboards: `http://localhost:5601`

## Sanity checks

Run these after the stack is up:

```bash
curl -sk -u admin:'SearchLab#2026!' https://localhost:9200/_cluster/health
curl -fs http://localhost:3000/api/admin/cluster
curl -u admin:'SearchLab#2026!' http://localhost:5601/api/status
```

Run a sample search request:

```bash
curl -fs -X POST http://localhost:3000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"playground renovation","mode":"hybrid","filters":{"phases":[],"boroughs":[],"fundingSources":[]},"sort":"relevance","page":1,"pageSize":3,"debug":false}'
```

## Local development

- Install dependencies on the host:

  ```bash
  pnpm install
  ```

- Run the app outside Docker if you prefer:

  ```bash
  pnpm dev
  ```

  Keep Ollama and OpenSearch running if you use this mode. In the standard Docker flow you do not need `pnpm dev`, because the `web` service is started by `pnpm docker:up`.

- Stop the Docker stack and clear volumes:

  ```bash
  pnpm docker:down
  ```

## Common operations

- Reindex the dataset again:

  ```bash
  pnpm seed
  ```

- Follow Docker logs:

  ```bash
  pnpm docker:logs
  ```

- Stop and remove containers plus volumes:

  ```bash
  pnpm docker:down
  ```

- Full clean reset:

  ```bash
  pnpm docker:down
  docker compose down -v
  pnpm docker:up
  pnpm seed
  ```

## Verification

These commands pass in the current implementation:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

`pnpm seed` and live search require OpenSearch and Ollama to be running.

## Search behavior

- `lexical`: BM25-oriented `multi_match` over title, description, search text, location, boroughs, and funding labels
- `vector`: k-NN search over `project_embedding`
- `hybrid`: lexical + vector combined through a search pipeline with min-max normalization
- Filters: phase, borough, funding source, budget range, completion date, and optional geo availability
- Facets: phase, borough, funding source, and funding band

## Data model notes

The app ingests the tabular NYC Parks dataset from:

- `https://data.cityofnewyork.us/resource/4hcv-tc5r.json`

Important normalized fields include:

- `project_id`, `title`, `description`, `phase`, `status`
- `boroughs`, `funding_sources`, `budget_band`, `budget_min`, `budget_max`
- `design_*`, `procurement_*`, `construction_*`, `forecast_completion`
- `location`, `has_coordinates`
- `search_text`
- `project_embedding`

## Docker notes

- The Compose stack uses `opensearchproject/opensearch:3.3.0` and matching Dashboards
- Security stays enabled locally; the app connects with credentials over HTTPS and skips certificate validation for local self-signed certs
- The `web` container expects Ollama on the host at `http://host.docker.internal:11434`

## Not in scope for v1

- RAG or answer generation
- OpenSearch ML Commons remote model connectors
- Multi-node cluster experiments
- Synonyms, autocomplete, reranking, or evaluation pipelines
- Production-grade cert management, auth hardening, snapshots, or ISM

## References

- [OpenSearch Docker docs](https://docs.opensearch.org/latest/install-and-configure/install-opensearch/docker)
- [OpenSearch vector search](https://docs.opensearch.org/latest/vector-search/)
- [OpenSearch filtered vector search](https://docs.opensearch.org/latest/vector-search/filter-search-knn/index/)
- [OpenSearch hybrid query](https://docs.opensearch.org/latest/query-dsl/compound/hybrid/)
- [OpenSearch normalization processor](https://docs.opensearch.org/latest/search-plugins/search-pipelines/normalization-processor/)
- [OpenSearch hybrid search guide](https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/)
- [OpenSearch faceted search tutorial](https://docs.opensearch.org/latest/tutorials/faceted-search/)
- [Ollama qwen3-embedding](https://ollama.com/library/qwen3-embedding)
- [NYC Parks Capital Project Tracker](https://catalog.data.gov/dataset/capital-projects-tracker)
