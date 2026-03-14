"use client";

import {
  useEffect,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import {
  ArrowRight,
  Bot,
  Database,
  ExternalLink,
  Filter,
  Layers3,
  LoaderCircle,
  RefreshCcw,
  Search as SearchIcon,
  Server,
  Sparkles,
  Telescope,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCurrencyRange,
  formatPercent,
  formatShortDate,
} from "@/lib/formatters";
import type {
  CapitalProjectDocument,
  ClusterStatus,
  FacetBucket,
  FilterState,
  ReindexReport,
  SearchRequest,
  SearchResponse,
  SortOption,
} from "@/lib/types";

const initialRequest: SearchRequest = {
  query: "",
  mode: "lexical",
  filters: {
    phases: [],
    boroughs: [],
    fundingSources: [],
    budget: {},
    completion: {},
  },
  sort: "relevance",
  page: 1,
  pageSize: 12,
  debug: true,
};

const modeOptions = [
  { value: "lexical", label: "Lexical", hint: "BM25 / keyword-heavy search" },
  { value: "vector", label: "Vector", hint: "Embedding-only similarity" },
  { value: "hybrid", label: "Hybrid", hint: "BM25 + vector + normalization" },
] as const;

const sortOptions: Array<{ value: SortOption; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "updated_desc", label: "Last updated" },
  { value: "updated_asc", label: "Oldest update" },
  { value: "funding_desc", label: "Funding high to low" },
  { value: "funding_asc", label: "Funding low to high" },
  { value: "completion_asc", label: "Closest completion" },
  { value: "completion_desc", label: "Latest completion" },
];

function extractErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const errorValue = payload.error;
    if (typeof errorValue === "string") {
      return errorValue;
    }

    if (
      errorValue &&
      typeof errorValue === "object" &&
      "formErrors" in errorValue &&
      Array.isArray(errorValue.formErrors)
    ) {
      return String(errorValue.formErrors[0] ?? "Request failed.");
    }
  }

  return "Request failed.";
}

function toggleFacet(values: string[], facet: string, checked: boolean) {
  const nextValues = new Set(values);

  if (checked) {
    nextValues.add(facet);
  } else {
    nextValues.delete(facet);
  }

  return Array.from(nextValues);
}

function JsonPanel({ data }: { data: unknown }) {
  return (
    <ScrollArea className="h-[18rem] rounded-xl border bg-background/60">
      <pre className="p-4 font-mono text-xs leading-6 text-foreground/80">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

function FacetGroup({
  label,
  buckets,
  selected,
  onToggle,
}: {
  label: string;
  buckets: FacetBucket[];
  selected: string[];
  onToggle: (value: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <Badge variant="outline">{buckets.length}</Badge>
      </div>
      <div className="space-y-2">
        {buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No facet values yet.</p>
        ) : null}
        {buckets.map((bucket) => {
          const checked = selected.includes(bucket.value);
          return (
            <label
              key={bucket.value}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-muted/60"
            >
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    onToggle(bucket.value, Boolean(nextChecked))
                  }
                />
                <span className="text-sm text-foreground">{bucket.value}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {bucket.count}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function SearchWorkbench({
  appTitle = "OpenSearch Research Sandbox",
}: {
  appTitle?: string;
}) {
  const [request, setRequest] = useState<SearchRequest>(initialRequest);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [reindexReport, setReindexReport] = useState<ReindexReport | null>(null);
  const [selectedProject, setSelectedProject] =
    useState<CapitalProjectDocument | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadClusterStatus() {
    const apiResponse = await fetch("/api/admin/cluster", {
      cache: "no-store",
    });
    const payload = (await apiResponse.json()) as ClusterStatus;
    setClusterStatus(payload);
  }

  async function runSearch(nextRequest: SearchRequest) {
    setErrorMessage(null);

    const apiResponse = await fetch("/api/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(nextRequest),
    });
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    setResponse(payload as SearchResponse);
    setRequest(nextRequest);
  }

  async function loadProject(projectId: string) {
    setErrorMessage(null);

    const apiResponse = await fetch(`/api/projects/${projectId}`, {
      cache: "no-store",
    });
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    setSelectedProject(payload as CapitalProjectDocument);
    setDetailsOpen(true);
  }

  async function triggerReindex() {
    setErrorMessage(null);

    const apiResponse = await fetch("/api/admin/reindex", {
      method: "POST",
    });
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    setReindexReport(payload as ReindexReport);
    await Promise.all([
      loadClusterStatus(),
      runSearch({
        ...request,
        page: 1,
      }),
    ]);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [clusterResponse, searchApiResponse] = await Promise.all([
          fetch("/api/admin/cluster", { cache: "no-store" }),
          fetch("/api/search", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(initialRequest),
          }),
        ]);
        const clusterPayload = (await clusterResponse.json()) as ClusterStatus;
        const searchPayload = (await searchApiResponse.json()) as SearchResponse;

        if (cancelled) {
          return;
        }

        setClusterStatus(clusterPayload);
        setResponse(searchPayload);
        setRequest(initialRequest);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Initial load failed.",
          );
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = response
    ? Math.max(1, Math.ceil(response.total / request.pageSize))
    : 1;

  function updateFilters(updater: (filters: FilterState) => FilterState) {
    const nextRequest = {
      ...request,
      page: 1,
      filters: updater(request.filters),
    };
    setRequest(nextRequest);
  }

  function handleBudgetChange(
    key: "min" | "max",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const rawValue = event.target.value;
    updateFilters((filters) => ({
      ...filters,
      budget: {
        ...filters.budget,
        [key]: rawValue.length > 0 ? Number(rawValue) : undefined,
      },
    }));
  }

  function handleDateChange(
    key: "from" | "to",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    updateFilters((filters) => ({
      ...filters,
      completion: {
        ...filters.completion,
        [key]: event.target.value || undefined,
      },
    }));
  }

  return (
    <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
      <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
          <Card className="dashboard-panel subtle-grid relative overflow-hidden border-border/80">
            <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-chart-2 via-accent to-chart-1" />
            <CardHeader className="gap-3 border-b border-border/70 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  OpenSearch
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  NYC Parks Capital Projects
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  Qwen embeddings
                </Badge>
              </div>
              <CardTitle className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {appTitle}
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 text-muted-foreground">
                Compare lexical, vector, and hybrid retrieval against public
                capital-project data, inspect the exact DSL sent to OpenSearch,
                and learn how filters, aggregations, pipelines, and embeddings
                behave in one local workbench.
              </CardDescription>
              <div className="grid gap-4 pt-2 md:grid-cols-[minmax(0,1fr)_150px_170px_180px]">
                <div className="space-y-2">
                  <Label htmlFor="query">Research query</Label>
                  <Input
                    id="query"
                    placeholder="Find waterfront resiliency projects finishing after 2026"
                    value={request.query}
                    onChange={(event) =>
                      setRequest({
                        ...request,
                        page: 1,
                        query: event.target.value,
                      })
                    }
                    className="h-10 bg-background/90"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select
                    value={request.mode}
                    onValueChange={(value) =>
                      setRequest({
                        ...request,
                        page: 1,
                        mode: value as SearchRequest["mode"],
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full bg-background/90">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort</Label>
                  <Select
                    value={request.sort}
                    onValueChange={(value) =>
                      setRequest({
                        ...request,
                        page: 1,
                        sort: value as SortOption,
                      })
                    }
                  >
                    <SelectTrigger className="h-10 w-full bg-background/90">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    className="h-10 flex-1"
                    onClick={() =>
                      startTransition(() => {
                        void runSearch({
                          ...request,
                          page: 1,
                        });
                      })
                    }
                    disabled={isPending}
                  >
                    {isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <SearchIcon />
                    )}
                    Run search
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 bg-background/90"
                    onClick={() =>
                      startTransition(() => {
                        void loadClusterStatus();
                      })
                    }
                    disabled={isPending}
                  >
                    <RefreshCcw className={isPending ? "animate-spin" : ""} />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Filter className="size-4" />
                  Facets update under the active filter set.
                </span>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="size-4" />
                  Hybrid mode uses a search pipeline normalization stage.
                </span>
                {request.mode !== "lexical" && !request.query.trim() ? (
                  <span className="inline-flex items-center gap-2 text-chart-5">
                    <Bot className="size-4" />
                    Vector and hybrid modes fall back to lexical when the query
                    box is empty.
                  </span>
                ) : null}
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card className="dashboard-panel border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="size-4 text-chart-2" />
                  Cluster status
                </CardTitle>
                <CardDescription>
                  Secure single-node OpenSearch plus Dashboards.
                </CardDescription>
                <CardAction>
                  <Badge
                    variant={clusterStatus?.connected ? "secondary" : "destructive"}
                  >
                    {clusterStatus?.connected ? "Connected" : "Offline"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-xl border bg-background/70 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Cluster
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {clusterStatus?.clusterName ?? "Unavailable"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {clusterStatus?.version
                        ? `v${clusterStatus.version}`
                        : "Version unknown"}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background/70 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Alias docs
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {clusterStatus?.documentCount?.toLocaleString() ?? "0"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {clusterStatus?.indexReady
                        ? clusterStatus.indexAlias
                        : "Run initial reindex"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={clusterStatus?.searchPipelineReady ? "secondary" : "outline"}>
                    search pipeline
                  </Badge>
                  <Badge variant={clusterStatus?.ingestPipelineReady ? "secondary" : "outline"}>
                    ingest pipeline
                  </Badge>
                  <Badge variant={clusterStatus?.ollamaReachable ? "secondary" : "outline"}>
                    {clusterStatus?.ollamaReachable ? "ollama reachable" : "ollama offline"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-panel border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers3 className="size-4 text-chart-1" />
                  Index workflow
                </CardTitle>
                <CardDescription>
                  Pull the latest public dataset, regenerate embeddings, create
                  a versioned index, and repoint the alias.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-background/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Embedding model
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {clusterStatus?.ollamaModel ?? "qwen3-embedding:0.6b"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Host Ollama via `host.docker.internal`.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    startTransition(() => {
                      void triggerReindex();
                    })
                  }
                  disabled={isPending}
                >
                  {isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Database />
                  )}
                  Reindex public dataset
                </Button>
                {reindexReport ? (
                  <div className="rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {reindexReport.totalIndexed.toLocaleString()} projects
                      indexed
                    </p>
                    <p>
                      {reindexReport.indexName} aliased to{" "}
                      {reindexReport.alias} in{" "}
                      {(reindexReport.durationMs / 1000).toFixed(1)}s.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {clusterStatus?.error ? (
          <Alert>
            <AlertTitle>Local runtime note</AlertTitle>
            <AlertDescription>
              {clusterStatus.error}. Start Docker Compose and ensure Ollama is
              serving the configured model before expecting live results.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="dashboard-panel border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="size-4 text-chart-2" />
                  Advanced filters
                </CardTitle>
                <CardDescription>
                  These filters feed directly into OpenSearch query filters and
                  aggregations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="debug-mode" className="text-sm font-medium">
                      Debug payload
                    </Label>
                    <Switch
                      checked={request.debug}
                      onCheckedChange={(checked) =>
                        setRequest({
                          ...request,
                          debug: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="has-coordinates" className="text-sm font-medium">
                      Only mapped projects
                    </Label>
                    <Switch
                      checked={Boolean(request.filters.hasCoordinates)}
                      onCheckedChange={(checked) =>
                        updateFilters((filters) => ({
                          ...filters,
                          hasCoordinates: checked || undefined,
                        }))
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Budget range
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="space-y-2">
                      <Label htmlFor="budget-min">Minimum USD</Label>
                      <Input
                        id="budget-min"
                        type="number"
                        value={request.filters.budget?.min ?? ""}
                        onChange={(event) => handleBudgetChange("min", event)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="budget-max">Maximum USD</Label>
                      <Input
                        id="budget-max"
                        type="number"
                        value={request.filters.budget?.max ?? ""}
                        onChange={(event) => handleBudgetChange("max", event)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Forecast completion
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="space-y-2">
                      <Label htmlFor="completion-from">From</Label>
                      <Input
                        id="completion-from"
                        type="date"
                        value={request.filters.completion?.from ?? ""}
                        onChange={(event) => handleDateChange("from", event)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="completion-to">To</Label>
                      <Input
                        id="completion-to"
                        type="date"
                        value={request.filters.completion?.to ?? ""}
                        onChange={(event) => handleDateChange("to", event)}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <FacetGroup
                  label="Current phase"
                  buckets={response?.facets.phases ?? []}
                  selected={request.filters.phases}
                  onToggle={(value, checked) =>
                    updateFilters((filters) => ({
                      ...filters,
                      phases: toggleFacet(filters.phases, value, checked),
                    }))
                  }
                />
                <FacetGroup
                  label="Borough"
                  buckets={response?.facets.boroughs ?? []}
                  selected={request.filters.boroughs}
                  onToggle={(value, checked) =>
                    updateFilters((filters) => ({
                      ...filters,
                      boroughs: toggleFacet(filters.boroughs, value, checked),
                    }))
                  }
                />
                <FacetGroup
                  label="Funding source"
                  buckets={response?.facets.fundingSources ?? []}
                  selected={request.filters.fundingSources}
                  onToggle={(value, checked) =>
                    updateFilters((filters) => ({
                      ...filters,
                      fundingSources: toggleFacet(
                        filters.fundingSources,
                        value,
                        checked,
                      ),
                    }))
                  }
                />

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      startTransition(() => {
                        void runSearch({
                          ...request,
                          page: 1,
                        });
                      })
                    }
                    disabled={isPending}
                  >
                    Apply filters
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setRequest({
                        ...request,
                        page: 1,
                        filters: initialRequest.filters,
                      });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-panel border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Telescope className="size-4 text-chart-5" />
                  Study prompts
                </CardTitle>
                <CardDescription>
                  Useful comparisons when you want to inspect scoring behavior.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <button
                  className="flex w-full items-center justify-between rounded-lg border bg-background/70 px-3 py-2 text-left transition hover:border-border hover:text-foreground"
                  onClick={() =>
                    setRequest({
                      ...request,
                      query:
                        "waterfront resiliency projects in Queens with construction underway",
                    })
                  }
                >
                  Waterfront resiliency in Queens
                  <ArrowRight className="size-4" />
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg border bg-background/70 px-3 py-2 text-left transition hover:border-border hover:text-foreground"
                  onClick={() =>
                    setRequest({
                      ...request,
                      query:
                        "playground reconstruction projects funded by city council",
                    })
                  }
                >
                  Playground reconstruction + City Council
                  <ArrowRight className="size-4" />
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-lg border bg-background/70 px-3 py-2 text-left transition hover:border-border hover:text-foreground"
                  onClick={() =>
                    setRequest({
                      ...request,
                      query:
                        "park projects projected to complete after 2026 with more than ten million dollars",
                    })
                  }
                >
                  Large late-stage projects
                  <ArrowRight className="size-4" />
                </button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="dashboard-panel border-border/80">
              <CardHeader className="gap-3 border-b border-border/70">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">Search results</CardTitle>
                    <CardDescription>
                      {response
                        ? `${response.total.toLocaleString()} results in ${response.latencyMs}ms`
                        : "Waiting for the first query."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {response?.mode ?? request.mode}
                    </Badge>
                    <Badge variant="outline">{request.pageSize} / page</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {response ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Phase</TableHead>
                        <TableHead>Borough</TableHead>
                        <TableHead>Funding</TableHead>
                        <TableHead>Forecast</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.hits.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No results matched the current combination of query
                            and filters.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {response.hits.map((hit) => {
                        const firstHighlight =
                          hit.highlights.title?.[0] ??
                          hit.highlights.description?.[0] ??
                          hit.highlights.search_text?.[0];

                        return (
                          <TableRow
                            key={hit.id}
                            className="cursor-pointer align-top"
                            onClick={() =>
                              startTransition(() => {
                                void loadProject(hit.id);
                              })
                            }
                          >
                            <TableCell className="min-w-[320px] space-y-2 whitespace-normal">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {hit.title}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {hit.locationName ?? "Location unavailable"}
                                </p>
                              </div>
                              <p className="text-sm leading-6 text-muted-foreground">
                                {hit.description}
                              </p>
                              {firstHighlight ? (
                                <div
                                  className="rounded-lg border border-accent/35 bg-accent/15 px-3 py-2 text-sm leading-6 text-foreground/85 [&_em]:font-semibold [&_em]:text-primary"
                                  dangerouslySetInnerHTML={{
                                    __html: firstHighlight,
                                  }}
                                />
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline">{hit.phase}</Badge>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              {hit.boroughs.length > 0
                                ? hit.boroughs.join(", ")
                                : "Unknown"}
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              {formatCurrencyRange(
                                hit.budgetMin,
                                hit.budgetMax,
                                hit.budgetBand,
                              )}
                            </TableCell>
                            <TableCell className="align-top">
                              {formatShortDate(hit.forecastCompletion)}
                            </TableCell>
                            <TableCell className="align-top font-mono text-xs text-muted-foreground">
                              {hit.score ? hit.score.toFixed(3) : "n/a"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {request.page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={request.page <= 1 || isPending}
                      onClick={() =>
                        startTransition(() => {
                          void runSearch({
                            ...request,
                            page: Math.max(1, request.page - 1),
                          });
                        })
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      disabled={request.page >= totalPages || isPending}
                      onClick={() =>
                        startTransition(() => {
                          void runSearch({
                            ...request,
                            page: request.page + 1,
                          });
                        })
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="dashboard-panel border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-chart-4" />
                  Debug surfaces
                </CardTitle>
                <CardDescription>
                  Inspect the exact request body, raw response, search profile,
                  and cluster telemetry used by the workbench.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="request">
                  <TabsList variant="line" className="w-full justify-start">
                    <TabsTrigger value="request">DSL</TabsTrigger>
                    <TabsTrigger value="response">Response</TabsTrigger>
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="cluster">Cluster</TabsTrigger>
                  </TabsList>
                  <TabsContent value="request" className="pt-4">
                    <JsonPanel data={response?.debug?.request ?? {}} />
                  </TabsContent>
                  <TabsContent value="response" className="pt-4">
                    <JsonPanel data={response?.debug?.response ?? {}} />
                  </TabsContent>
                  <TabsContent value="profile" className="pt-4">
                    <JsonPanel data={response?.debug?.profile ?? {}} />
                  </TabsContent>
                  <TabsContent value="cluster" className="pt-4">
                    <JsonPanel data={clusterStatus ?? {}} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <SheetContent side="right" className="w-[92vw] max-w-2xl bg-popover/98">
        <SheetHeader className="border-b border-border/70">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">project detail</Badge>
            {selectedProject?.phase ? (
              <Badge variant="outline">{selectedProject.phase}</Badge>
            ) : null}
            {selectedProject?.has_coordinates ? (
              <Badge variant="outline">has geo point</Badge>
            ) : null}
          </div>
          <SheetTitle>{selectedProject?.title ?? "Project details"}</SheetTitle>
          <SheetDescription>
            Deep view of the indexed document shape that backs search,
            filtering, and vector retrieval.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-full px-4 pb-6">
          {selectedProject ? (
            <div className="space-y-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card size="sm" className="border-border/80 bg-background/70">
                  <CardHeader>
                    <CardTitle className="text-sm">Funding</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-base font-semibold">
                      {formatCurrencyRange(
                        selectedProject.budget_min,
                        selectedProject.budget_max,
                        selectedProject.budget_band,
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedProject.funding_sources.join(", ") || "Unknown"}
                    </p>
                  </CardContent>
                </Card>
                <Card size="sm" className="border-border/80 bg-background/70">
                  <CardHeader>
                    <CardTitle className="text-sm">Progress</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-base font-semibold">
                      {formatPercent(selectedProject.overall_percent_complete)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Design {formatPercent(selectedProject.design_percent_complete)}
                      {" · "}
                      Procurement{" "}
                      {formatPercent(selectedProject.procurement_percent_complete)}
                      {" · "}
                      Construction{" "}
                      {formatPercent(selectedProject.construction_percent_complete)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card size="sm" className="border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>{selectedProject.description}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Boroughs
                      </p>
                      <p className="mt-1 text-foreground">
                        {selectedProject.boroughs.join(", ") || "Unknown"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Location
                      </p>
                      <p className="mt-1 text-foreground">
                        {selectedProject.location_name ?? "Unknown"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Forecast completion
                      </p>
                      <p className="mt-1 text-foreground">
                        {formatShortDate(selectedProject.forecast_completion)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Last updated
                      </p>
                      <p className="mt-1 text-foreground">
                        {formatShortDate(selectedProject.last_updated)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm" className="border-border/80 bg-background/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="size-4 text-chart-2" />
                    Search document payload
                  </CardTitle>
                  <CardDescription>
                    Indexed fields that drive filters, ranking, and vector
                    similarity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <JsonPanel
                    data={{
                      project_id: selectedProject.project_id,
                      agency: selectedProject.agency,
                      phase: selectedProject.phase,
                      park_id: selectedProject.park_id,
                      location: selectedProject.location,
                      tags: selectedProject.tags,
                      source_url: selectedProject.source_url,
                      search_text: selectedProject.search_text,
                    }}
                  />
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <a
                  href={selectedProject.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  <ExternalLink className="size-4" />
                  Source dataset
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
