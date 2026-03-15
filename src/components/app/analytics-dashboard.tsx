"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Activity,
  ArrowLeft,
  Database,
  Gauge,
  LoaderCircle,
  MapPinned,
  RefreshCcw,
  ScanSearch,
  Workflow,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { AnalyticsFilterBuilder } from "@/components/app/analytics-filter-builder";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAnalyticsFilterDraft,
  isAnalyticsFilterDraftComplete,
  toAnalyticsFilter,
  type AnalyticsFilter,
  type AnalyticsFilterDraft,
  type AnalyticsFilterField,
} from "@/lib/analytics-filters";
import {
  formatCompactCurrency,
  formatCompactNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AnalyticsSnapshot, FacetBucket } from "@/lib/types";

const deliveryChartConfig = {
  planned: {
    label: "Planning",
    color: "var(--chart-4)",
  },
  execution: {
    label: "Execution",
    color: "var(--chart-2)",
  },
  completed: {
    label: "Completed",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const budgetChartConfig = {
  budgetTotal: {
    label: "Budget exposure",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

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
      return String(errorValue.formErrors[0] ?? "Analytics request failed.");
    }
  }

  return "Analytics request failed.";
}

function formatBucketLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function JsonPanel({ data }: { data: unknown }) {
  return (
    <ScrollArea className="h-[24rem] rounded-xl border bg-background/60">
      <pre className="p-4 font-mono text-xs leading-6 text-foreground/80">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "accent";
}) {
  return (
    <Card className="dashboard-panel border-border/80">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </CardDescription>
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full border bg-background/80",
              tone === "accent" && "border-chart-5/30 text-chart-5",
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <CardTitle className="text-3xl font-semibold tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  );
}

function DimensionList({
  title,
  description,
  buckets,
}: {
  title: string;
  description: string;
  buckets: FacetBucket[];
}) {
  const maxCount = buckets[0]?.count ?? 0;

  return (
    <Card className="dashboard-panel border-border/80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {buckets.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            No buckets returned yet.
          </div>
        ) : (
          buckets.slice(0, 6).map((bucket) => {
            const width = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;

            return (
              <div key={bucket.value} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {formatBucketLabel(bucket.value)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {bucket.count.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard({
  initialSnapshot,
}: {
  initialSnapshot: AnalyticsSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilterDraft[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilter[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadAnalytics(filters: AnalyticsFilter[]) {
    const apiResponse = await fetch("/api/analytics", {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        filters,
      }),
    });
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    return payload as AnalyticsSnapshot;
  }

  async function refreshAnalytics() {
    setErrorMessage(null);
    const nextSnapshot = await loadAnalytics(appliedFilters);
    setSnapshot(nextSnapshot);
  }

  async function applyFilters() {
    setErrorMessage(null);

    if (draftFilters.some((filter) => !isAnalyticsFilterDraftComplete(filter))) {
      throw new Error("Complete or remove unfinished filters before applying.");
    }

    const nextFilters = draftFilters.map(toAnalyticsFilter);
    const nextSnapshot = await loadAnalytics(nextFilters);

    setAppliedFilters(nextFilters);
    setSnapshot(nextSnapshot);
  }

  async function clearFilters() {
    setErrorMessage(null);

    const nextSnapshot = await loadAnalytics([]);
    setDraftFilters([]);
    setAppliedFilters([]);
    setSnapshot(nextSnapshot);
  }

  function addFilter() {
    setDraftFilters((current) => [...current, createAnalyticsFilterDraft()]);
  }

  function changeFilter(nextFilter: AnalyticsFilterDraft) {
    setDraftFilters((current) =>
      current.map((filter) => (filter.id === nextFilter.id ? nextFilter : filter)),
    );
  }

  function removeFilter(filterId: string) {
    setDraftFilters((current) =>
      current.filter((filter) => filter.id !== filterId),
    );
  }

  function changeFilterField(filterId: string, field: AnalyticsFilterField) {
    setDraftFilters((current) =>
      current.map((filter) =>
        filter.id === filterId
          ? createAnalyticsFilterDraft(field, filter.id)
          : filter,
      ),
    );
  }

  const forecastCoverage =
    snapshot.totalProjects > 0
      ? ((snapshot.totalProjects - snapshot.missingForecastProjects) /
          snapshot.totalProjects) *
        100
      : 0;
  const geospatialCoverage =
    snapshot.totalProjects > 0
      ? (snapshot.geoTaggedProjects / snapshot.totalProjects) * 100
      : 0;
  const hasIncompleteFilters = draftFilters.some(
    (filter) => !isAnalyticsFilterDraftComplete(filter),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <Card className="dashboard-panel subtle-grid relative overflow-hidden border-border/80">
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-chart-4 via-chart-2 to-chart-5" />
          <CardHeader className="gap-4 border-b border-border/70 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                OpenSearch analytics
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                Capital program control room
              </Badge>
              <Badge variant="outline" className="rounded-full">
                Yearly date histogram
              </Badge>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl space-y-3">
                <CardTitle className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  Capital Project Analytics
                </CardTitle>
                <CardDescription className="text-base leading-7 text-muted-foreground">
                  Inspect portfolio-level signals from the same OpenSearch index
                  that powers search: terms, filters, stats, percentiles, and a
                  forecast timeline built directly from the seeded public data.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({
                      variant: "outline",
                      size: "lg",
                    }),
                    "bg-background/90",
                  )}
                >
                  <ArrowLeft />
                  Search workbench
                </Link>
                <Button
                  size="lg"
                  onClick={() =>
                    startTransition(() => {
                      void refreshAnalytics().catch((error) => {
                        setErrorMessage(
                          error instanceof Error
                            ? error.message
                            : "Analytics refresh failed.",
                        );
                      });
                    })
                  }
                  disabled={isPending}
                >
                  {isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCcw />
                  )}
                  Refresh analytics
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Workflow className="size-4" />
                Terms buckets expose phase, borough, and funding concentration.
              </span>
              <span className="inline-flex items-center gap-2">
                <ScanSearch className="size-4" />
                Debug tabs include the raw aggregation request and response.
              </span>
              <span className="inline-flex items-center gap-2">
                <Activity className="size-4" />
                Last generated {formatShortDate(snapshot.generatedAt)} with{" "}
                {snapshot.latencyMs}ms query latency.
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="dashboard-panel border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-chart-2" />
              Runtime context
            </CardTitle>
            <CardDescription>
              This page reads the seeded alias directly through one aggregation
              request.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="rounded-xl border bg-background/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Alias
              </p>
              <p className="mt-2 text-lg font-semibold">{snapshot.indexAlias}</p>
              <p className="text-sm text-muted-foreground">
                {snapshot.indexReady
                  ? "Analytics snapshot is reading from a ready alias."
                  : "Alias is not ready yet. Seed the index first."}
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Forecast coverage
              </p>
              <p className="mt-2 text-lg font-semibold">
                {formatPercent(forecastCoverage)}
              </p>
              <p className="text-sm text-muted-foreground">
                Projects with a usable forecast_completion date.
              </p>
            </div>
            <div className="rounded-xl border bg-background/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Geo coverage
              </p>
              <p className="mt-2 text-lg font-semibold">
                {formatPercent(geospatialCoverage)}
              </p>
              <p className="text-sm text-muted-foreground">
                Documents currently usable for map-based exploration.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Analytics refresh failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {!snapshot.indexReady ? (
        <Alert>
          <AlertTitle>Analytics index not ready</AlertTitle>
          <AlertDescription>
            Seed the dataset first, then refresh this page to populate the
            charts and breakdowns.
          </AlertDescription>
        </Alert>
      ) : null}

      <AnalyticsFilterBuilder
        snapshot={snapshot}
        draftFilters={draftFilters}
        appliedFilters={appliedFilters}
        isPending={isPending}
        hasIncompleteFilters={hasIncompleteFilters}
        onAddFilter={addFilter}
        onFieldChange={changeFilterField}
        onChangeFilter={changeFilter}
        onRemoveFilter={removeFilter}
        onApply={() =>
          startTransition(() => {
            void applyFilters().catch((error) => {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to apply analytics filters.",
              );
            });
          })
        }
        onClear={() =>
          startTransition(() => {
            void clearFilters().catch((error) => {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to clear analytics filters.",
              );
            });
          })
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Projects indexed"
          value={snapshot.totalProjects.toLocaleString()}
          description="Total portfolio size behind the analytics view."
          icon={Database}
        />
        <MetricCard
          title="Active delivery"
          value={snapshot.activeProjects.toLocaleString()}
          description={`${snapshot.completedProjects.toLocaleString()} projects are already marked completed.`}
          icon={Workflow}
        />
        <MetricCard
          title="Budget exposure"
          value={formatCompactCurrency(snapshot.budget.sum)}
          description={`Median project size ${formatCompactCurrency(snapshot.budget.median)} and p90 ${formatCompactCurrency(snapshot.budget.p90)}.`}
          icon={Gauge}
          tone="accent"
        />
        <MetricCard
          title="Geo-ready projects"
          value={snapshot.geoTaggedProjects.toLocaleString()}
          description={`${snapshot.missingForecastProjects.toLocaleString()} projects are still missing forecast completion dates.`}
          icon={MapPinned}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_420px]">
        <Card className="dashboard-panel border-border/80">
          <CardHeader>
            <CardTitle>Forecast delivery mix</CardTitle>
            <CardDescription>
              A stacked area view of planned, execution, and completed work by
              forecast year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.forecastTimeline.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed bg-background/70 px-6 text-center text-sm leading-6 text-muted-foreground">
                No forecast timeline is available yet. Seed the dataset or check
                whether forecast completion dates are populated.
              </div>
            ) : (
              <ChartContainer
                config={deliveryChartConfig}
                className="h-[320px] w-full aspect-auto"
              >
                <AreaChart
                  accessibilityLayer
                  data={snapshot.forecastTimeline}
                  margin={{ left: 8, right: 8, top: 12 }}
                >
                  <defs>
                    <linearGradient id="fillPlanned" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-planned)"
                        stopOpacity={0.85}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-planned)"
                        stopOpacity={0.18}
                      />
                    </linearGradient>
                    <linearGradient id="fillExecution" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-execution)"
                        stopOpacity={0.82}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-execution)"
                        stopOpacity={0.16}
                      />
                    </linearGradient>
                    <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-completed)"
                        stopOpacity={0.88}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-completed)"
                        stopOpacity={0.18}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={formatCompactNumber}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <>
                            <span className="text-muted-foreground">
                              {deliveryChartConfig[name as keyof typeof deliveryChartConfig]
                                ?.label ?? name}
                            </span>
                            <span className="font-mono font-medium text-foreground">
                              {Number(value).toLocaleString()}
                            </span>
                          </>
                        )}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="planned"
                    stackId="projects"
                    fill="url(#fillPlanned)"
                    stroke="var(--color-planned)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="execution"
                    stackId="projects"
                    fill="url(#fillExecution)"
                    stroke="var(--color-execution)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stackId="projects"
                    fill="url(#fillCompleted)"
                    stroke="var(--color-completed)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <DimensionList
            title="Phase concentration"
            description="Which delivery stages dominate the current portfolio."
            buckets={snapshot.phaseCounts}
          />
          <DimensionList
            title="Borough concentration"
            description="How the seeded projects distribute across boroughs."
            buckets={snapshot.boroughCounts}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="dashboard-panel border-border/80">
          <CardHeader>
            <CardTitle>Capital exposure by forecast year</CardTitle>
            <CardDescription>
              Summed budget proxy across the yearly forecast curve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.forecastTimeline.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed bg-background/70 px-6 text-center text-sm leading-6 text-muted-foreground">
                Budget exposure appears once the timeline has forecasted
                completions to group by year.
              </div>
            ) : (
              <ChartContainer
                config={budgetChartConfig}
                className="h-[280px] w-full aspect-auto"
              >
                <AreaChart
                  accessibilityLayer
                  data={snapshot.forecastTimeline}
                  margin={{ left: 8, right: 8, top: 12 }}
                >
                  <defs>
                    <linearGradient id="fillBudget" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-budgetTotal)"
                        stopOpacity={0.88}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-budgetTotal)"
                        stopOpacity={0.16}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={formatCompactCurrency}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className="font-mono font-medium text-foreground">
                            {formatCompactCurrency(Number(value))}
                          </span>
                        )}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="budgetTotal"
                    fill="url(#fillBudget)"
                    stroke="var(--color-budgetTotal)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <DimensionList
            title="Funding concentration"
            description="Funding sources that appear most frequently in the source feed."
            buckets={snapshot.fundingCounts}
          />
          <Card className="dashboard-panel border-border/80">
            <CardHeader>
              <CardTitle>Portfolio signals</CardTitle>
              <CardDescription>
                Quick portfolio health indicators derived from aggregate fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Average completion
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatPercent(snapshot.averageCompletion)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Derived from the highest reported phase-complete percentage on
                  each project.
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Planning vs execution
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {snapshot.planningProjects.toLocaleString()} /{" "}
                  {snapshot.executionProjects.toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  A quick read on near-term pipeline versus construction-heavy
                  workload.
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Max project budget proxy
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatCompactCurrency(snapshot.budget.max)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Based on the dataset’s coarse budget band normalization.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="dashboard-panel border-border/80">
        <CardHeader>
          <CardTitle>Aggregation trace</CardTitle>
          <CardDescription>
            Inspect the exact OpenSearch request and the raw aggregation payload
            behind this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="request" className="gap-4">
            <TabsList>
              <TabsTrigger value="request">Request DSL</TabsTrigger>
              <TabsTrigger value="response">Raw response</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="request">
              <JsonPanel data={snapshot.debug.request} />
            </TabsContent>
            <TabsContent value="response">
              <JsonPanel data={snapshot.debug.response ?? {}} />
            </TabsContent>
            <TabsContent value="notes">
              <div className="rounded-xl border bg-background/70 p-4">
                <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                  {snapshot.debug.notes.map((note) => (
                    <li key={note} className="rounded-lg border bg-background/80 px-3 py-2">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
