"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  ArrowLeft,
  BarChart3,
  Copy,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Scale,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRelevanceFixturesForMode } from "@/lib/opensearch/relevance-fixture-utils";
import { cn } from "@/lib/utils";
import type {
  RelevanceEvalResponse,
  RelevanceFixture,
  RelevanceFixtureMode,
} from "@/lib/types";

const CUSTOM_FIXTURES_STORAGE_KEY = "opensearch.relevance.custom-fixtures.v1";
const customFixtureListeners = new Set<() => void>();
const EMPTY_CUSTOM_FIXTURES: CustomFixtureDraft[] = [];
let cachedCustomFixturesRaw: string | null | undefined;
let cachedCustomFixturesSnapshot: CustomFixtureDraft[] = EMPTY_CUSTOM_FIXTURES;

const fixtureModeOptions: Array<{
  value: RelevanceFixtureMode;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Default fixtures",
    description: "Use the repo-managed baseline fixture set.",
  },
  {
    value: "custom",
    label: "Custom fixtures",
    description: "Run only the fixtures saved in this browser.",
  },
  {
    value: "combined",
    label: "Combined",
    description: "Benchmark defaults plus any ready custom fixtures.",
  },
];

type CustomFixtureDraft = {
  id: string;
  label: string;
  query: string;
  ratings: Array<{
    _id: string;
    rating: number;
  }>;
};

function formatScore(value: number | null) {
  return value === null ? "n/a" : value.toFixed(3);
}

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
      return String(errorValue.formErrors[0] ?? "Relevance evaluation failed.");
    }
  }

  return "Relevance evaluation failed.";
}

function createFixtureId(prefix = "custom") {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}

function clampRating(value: number) {
  if (value < 0) {
    return 0;
  }

  if (value > 3) {
    return 3;
  }

  return Math.round(value);
}

function createDraftFromFixture(
  fixture?: RelevanceFixture,
  options?: {
    duplicate?: boolean;
  },
): CustomFixtureDraft {
  return {
    id: createFixtureId(fixture?.id ?? "custom"),
    label: fixture
      ? options?.duplicate
        ? `${fixture.label} copy`
        : fixture.label
      : "",
    query: fixture?.query ?? "",
    ratings:
      fixture?.ratings.map((rating) => ({
        _id: rating._id,
        rating: rating.rating,
      })) ?? [{ _id: "", rating: 3 }],
  };
}

function normalizeCustomFixtureDraft(value: unknown): CustomFixtureDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    label?: unknown;
    query?: unknown;
    ratings?: unknown;
  };
  const ratings = Array.isArray(candidate.ratings)
    ? candidate.ratings.flatMap((rating) => {
        if (!rating || typeof rating !== "object") {
          return [];
        }

        const item = rating as {
          _id?: unknown;
          rating?: unknown;
        };

        return [
          {
            _id: typeof item._id === "string" ? item._id : "",
            rating:
              typeof item.rating === "number" ? clampRating(item.rating) : 3,
          },
        ];
      })
    : [];

  return {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : createFixtureId(),
    label: typeof candidate.label === "string" ? candidate.label : "",
    query: typeof candidate.query === "string" ? candidate.query : "",
    ratings: ratings.length > 0 ? ratings : [{ _id: "", rating: 3 }],
  };
}

function parseStoredCustomFixtures(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((fixture) => {
      const normalized = normalizeCustomFixtureDraft(fixture);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
}

function getCachedCustomFixturesSnapshot(rawValue: string | null) {
  if (rawValue === cachedCustomFixturesRaw) {
    return cachedCustomFixturesSnapshot;
  }

  const parsedFixtures = parseStoredCustomFixtures(rawValue);

  cachedCustomFixturesRaw = rawValue;
  cachedCustomFixturesSnapshot =
    parsedFixtures.length > 0 ? parsedFixtures : EMPTY_CUSTOM_FIXTURES;

  return cachedCustomFixturesSnapshot;
}

function readCustomFixturesSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_CUSTOM_FIXTURES;
  }

  return getCachedCustomFixturesSnapshot(
    window.localStorage.getItem(CUSTOM_FIXTURES_STORAGE_KEY),
  );
}

function readCustomFixturesServerSnapshot() {
  return EMPTY_CUSTOM_FIXTURES;
}

function subscribeToCustomFixtures(listener: () => void) {
  customFixtureListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      customFixtureListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CUSTOM_FIXTURES_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    customFixtureListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function writeCustomFixturesSnapshot(fixtures: CustomFixtureDraft[]) {
  if (typeof window === "undefined") {
    return;
  }

  const rawValue = JSON.stringify(fixtures);

  cachedCustomFixturesRaw = rawValue;
  cachedCustomFixturesSnapshot =
    fixtures.length > 0 ? parseStoredCustomFixtures(rawValue) : EMPTY_CUSTOM_FIXTURES;
  window.localStorage.setItem(CUSTOM_FIXTURES_STORAGE_KEY, rawValue);

  for (const listener of customFixtureListeners) {
    listener();
  }
}

function toValidFixture(
  draft: CustomFixtureDraft,
): RelevanceFixture | null {
  const label = draft.label.trim();
  const query = draft.query.trim();
  const ratings = draft.ratings.flatMap((rating) => {
    const projectId = rating._id.trim();

    if (!projectId) {
      return [];
    }

    return [
      {
        _id: projectId,
        rating: clampRating(rating.rating),
      },
    ];
  });

  if (!label || !query || ratings.length === 0) {
    return null;
  }

  return {
    id: draft.id,
    label,
    query,
    ratings,
  };
}

function getFixtureModeLabel(fixtureMode: RelevanceFixtureMode) {
  return (
    fixtureModeOptions.find((option) => option.value === fixtureMode)?.label ??
    fixtureMode
  );
}

function getBestRunLabel(
  scores: Array<{
    label: string;
    metricScore: number | null;
  }>,
) {
  let bestLabel: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const score of scores) {
    if (typeof score.metricScore !== "number") {
      continue;
    }

    if (score.metricScore > bestScore) {
      bestScore = score.metricScore;
      bestLabel = score.label;
    }
  }

  return bestLabel;
}

export function RelevanceLab({
  defaultFixtures,
  initialEvaluation,
}: {
  defaultFixtures: RelevanceFixture[];
  initialEvaluation: RelevanceEvalResponse;
}) {
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFixtureMode, setSelectedFixtureMode] =
    useState<RelevanceFixtureMode>(initialEvaluation.fixtureMode);
  const [isPending, startTransition] = useTransition();
  const customFixtures = useSyncExternalStore(
    subscribeToCustomFixtures,
    readCustomFixturesSnapshot,
    readCustomFixturesServerSnapshot,
  );

  const readyCustomFixtures = useMemo(
    () =>
      customFixtures.flatMap((fixture) => {
        const nextFixture = toValidFixture(fixture);
        return nextFixture ? [nextFixture] : [];
      }),
    [customFixtures],
  );

  const activeFixturePreview = useMemo(
    () =>
      getRelevanceFixturesForMode(
        selectedFixtureMode,
        readyCustomFixtures,
        defaultFixtures,
      ),
    [defaultFixtures, readyCustomFixtures, selectedFixtureMode],
  );

  const comparisonRows = useMemo(() => {
    const runScoreMaps = new Map(
      evaluation.runs.map((run) => [
        run.id,
        new Map(run.queryScores.map((score) => [score.id, score])),
      ]),
    );

    return evaluation.fixtures.map((fixture) => {
      const scores = evaluation.runs.map((run) => ({
        id: run.id,
        label: run.label,
        metricScore:
          runScoreMaps.get(run.id)?.get(fixture.id)?.metricScore ?? null,
      }));

      return {
        fixture,
        scores,
        bestRunLabel: getBestRunLabel(scores),
      };
    });
  }, [evaluation.fixtures, evaluation.runs]);

  const lexicalRun = evaluation.runs.find((run) => run.id === "lexical");

  function updateCustomFixture(
    fixtureId: string,
    updater: (fixture: CustomFixtureDraft) => CustomFixtureDraft,
  ) {
    writeCustomFixturesSnapshot(
      customFixtures.map((fixture) =>
        fixture.id === fixtureId ? updater(fixture) : fixture,
      ),
    );
  }

  function addCustomFixture() {
    writeCustomFixturesSnapshot([
      ...customFixtures,
      createDraftFromFixture(),
    ]);
  }

  function copyFixtureToCustom(fixture: RelevanceFixture) {
    writeCustomFixturesSnapshot([
      ...customFixtures,
      createDraftFromFixture(fixture, {
        duplicate: true,
      }),
    ]);
    setSelectedFixtureMode("combined");
  }

  async function runEvaluation() {
    setErrorMessage(null);

    if (selectedFixtureMode === "custom" && readyCustomFixtures.length === 0) {
      setErrorMessage(
        "Add at least one complete custom fixture with a query and judged project ids before running custom evaluation.",
      );
      return;
    }

    const apiResponse = await fetch("/api/relevance/eval", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtureMode: selectedFixtureMode,
        fixtures: readyCustomFixtures,
      }),
      cache: "no-store",
    });
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    setEvaluation(payload as RelevanceEvalResponse);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <Card className="dashboard-panel subtle-grid relative overflow-hidden border-border/80">
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-chart-5 via-chart-2 to-chart-4" />
          <CardHeader className="gap-4 border-b border-border/70 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                Relevance lab
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                NDCG@10
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {getFixtureModeLabel(selectedFixtureMode)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl space-y-3">
                <CardTitle className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  Search Relevance Evaluation
                </CardTitle>
                <CardDescription className="text-base leading-7 text-muted-foreground">
                  Compare ranking quality against a small judged fixture set.
                  Default fixtures ship with the repo, while custom fixtures are
                  saved in your browser and can be mixed into the benchmark when
                  you want to test your own edge cases.
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
                      void runEvaluation().catch((error) => {
                        setErrorMessage(
                          error instanceof Error
                            ? error.message
                            : "Relevance refresh failed.",
                        );
                      });
                    })
                  }
                  disabled={
                    isPending ||
                    (selectedFixtureMode === "custom" &&
                      readyCustomFixtures.length === 0)
                  }
                >
                  {isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCcw />
                  )}
                  Run selected fixtures
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Scale className="size-4" />
                Each fixture appears once in the comparison table instead of
                being repeated under every run.
              </span>
              <span className="inline-flex items-center gap-2">
                <Sparkles className="size-4" />
                Hybrid and RRF runs are replayed through their live search
                pipelines and scored with local NDCG.
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="dashboard-panel border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-chart-2" />
              Fixture scope
            </CardTitle>
            <CardDescription>
              Choose which fixture set to score and keep custom fixtures local
              to this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fixture-mode">Fixture set</Label>
              <Select
                value={selectedFixtureMode}
                onValueChange={(value) =>
                  setSelectedFixtureMode(value as RelevanceFixtureMode)
                }
              >
                <SelectTrigger id="fixture-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {fixtureModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex flex-col items-start">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Current results show {getFixtureModeLabel(evaluation.fixtureMode)}
                . Switch the selector, then run the selected fixtures to update
                the benchmark.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Default fixtures
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {defaultFixtures.length}
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Ready custom
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {readyCustomFixtures.length}
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Selected scope
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {activeFixturePreview.length} fixtures
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Generated
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {new Date(evaluation.generatedAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Evaluation failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {evaluation.runs.map((run) => {
          const deltaFromLexical =
            run.id !== "lexical" &&
            typeof run.metricScore === "number" &&
            typeof lexicalRun?.metricScore === "number"
              ? run.metricScore - lexicalRun.metricScore
              : null;

          return (
            <Card key={run.id} className="dashboard-panel border-border/80">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{run.label}</CardTitle>
                    <CardDescription>{run.id}</CardDescription>
                  </div>
                  <Badge variant={run.error ? "destructive" : "secondary"}>
                    {run.error ? "Error" : formatScore(run.metricScore)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Average NDCG@10
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatScore(run.metricScore)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {deltaFromLexical === null
                      ? "Baseline run for the current fixture set."
                      : deltaFromLexical >= 0
                        ? `+${deltaFromLexical.toFixed(3)} vs lexical`
                        : `${deltaFromLexical.toFixed(3)} vs lexical`}
                  </p>
                </div>
                {run.error ? (
                  <Alert variant="destructive">
                    <AlertTitle>{run.label} failed</AlertTitle>
                    <AlertDescription>{run.error}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="dashboard-panel border-border/80">
        <CardHeader>
          <CardTitle>Per-query comparison</CardTitle>
          <CardDescription>
            One row per fixture, with all ranking configurations side by side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comparisonRows.length === 0 ? (
            <div className="rounded-[1.4rem] border border-dashed border-border/70 bg-background/50 p-6 text-sm text-muted-foreground">
              No fixtures are active for this run yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fixture</TableHead>
                  {evaluation.runs.map((run) => (
                    <TableHead key={run.id}>{run.label}</TableHead>
                  ))}
                  <TableHead>Best</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonRows.map((row) => (
                  <TableRow key={row.fixture.id}>
                    <TableCell className="whitespace-normal">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {row.fixture.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.fixture.query}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.fixture.ratings.length} judged documents
                        </p>
                      </div>
                    </TableCell>
                    {row.scores.map((score) => (
                      <TableCell key={score.id} className="font-mono text-sm">
                        {formatScore(score.metricScore)}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.bestRunLabel ? (
                        <Badge variant="outline">{row.bestRunLabel}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">n/a</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-panel border-border/80">
        <CardHeader>
          <CardTitle>Fixture sets</CardTitle>
          <CardDescription>
            Default fixtures are read-only. Custom fixtures are editable, stored
            locally, and only complete fixtures are included when you run
            evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="default" className="gap-4">
            <TabsList>
              <TabsTrigger value="default">Default fixtures</TabsTrigger>
              <TabsTrigger value="custom">Custom fixtures</TabsTrigger>
            </TabsList>

            <TabsContent value="default" className="space-y-4">
              <Accordion multiple className="gap-3">
                {defaultFixtures.map((fixture) => (
                  <AccordionItem
                    key={fixture.id}
                    value={fixture.id}
                    className="rounded-[1.4rem] border border-border/70 bg-background/70 px-4"
                  >
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex flex-1 items-center justify-between gap-4 pr-4">
                        <div className="space-y-1">
                          <p className="text-lg font-semibold text-foreground">
                            {fixture.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {fixture.query}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {fixture.ratings.length} judged docs
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {fixture.ratings.map((rating) => (
                            <Badge
                              key={`${fixture.id}-${rating._id}`}
                              variant="secondary"
                              className="rounded-full"
                            >
                              {rating._id} · {rating.rating}
                            </Badge>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyFixtureToCustom(fixture)}
                        >
                          <Copy />
                          Copy to custom
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    Local custom fixtures
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Complete fixtures need a label, a query, and at least one
                    judged project id. Drafts stay saved locally while you edit
                    them.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addCustomFixture}>
                  <Plus />
                  Add fixture
                </Button>
              </div>

              {customFixtures.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-border/70 bg-background/50 p-6 text-sm text-muted-foreground">
                  No custom fixtures yet. Copy one of the defaults or add a new
                  fixture from scratch.
                </div>
              ) : (
                <Accordion multiple className="gap-3">
                  {customFixtures.map((fixture) => {
                    const readyFixture = toValidFixture(fixture);

                    return (
                      <AccordionItem
                        key={fixture.id}
                        value={fixture.id}
                        className="rounded-[1.4rem] border border-border/70 bg-background/70 px-4"
                      >
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex flex-1 items-center justify-between gap-4 pr-4">
                            <div className="space-y-1">
                              <p className="text-lg font-semibold text-foreground">
                                {fixture.label.trim() || "Untitled fixture"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {fixture.query.trim() || "Add a benchmark query"}
                              </p>
                            </div>
                            <Badge
                              variant={readyFixture ? "secondary" : "outline"}
                            >
                              {readyFixture ? "Ready" : "Draft"}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${fixture.id}-label`}>
                                  Fixture label
                                </Label>
                                <Input
                                  id={`${fixture.id}-label`}
                                  value={fixture.label}
                                  onChange={(event) =>
                                    updateCustomFixture(fixture.id, (current) => ({
                                      ...current,
                                      label: event.target.value,
                                    }))
                                  }
                                  placeholder="Queens playground reconstruction"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`${fixture.id}-query`}>
                                  Search query
                                </Label>
                                <Input
                                  id={`${fixture.id}-query`}
                                  value={fixture.query}
                                  onChange={(event) =>
                                    updateCustomFixture(fixture.id, (current) => ({
                                      ...current,
                                      query: event.target.value,
                                    }))
                                  }
                                  placeholder="queens playground reconstruction"
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-foreground">
                                  Judged documents
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    updateCustomFixture(
                                      fixture.id,
                                      (current) => ({
                                        ...current,
                                        ratings: [
                                          ...current.ratings,
                                          {
                                            _id: "",
                                            rating: 3,
                                          },
                                        ],
                                      }),
                                    )
                                  }
                                >
                                  <Plus />
                                  Add judgment
                                </Button>
                              </div>

                              <div className="space-y-2">
                                {fixture.ratings.map((rating, ratingIndex) => (
                                  <div
                                    key={`${fixture.id}-${ratingIndex}`}
                                    className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_44px]"
                                  >
                                    <Input
                                      value={rating._id}
                                      onChange={(event) =>
                                        updateCustomFixture(
                                          fixture.id,
                                          (current) => ({
                                            ...current,
                                            ratings: current.ratings.map(
                                              (item, itemIndex) =>
                                                itemIndex === ratingIndex
                                                  ? {
                                                      ...item,
                                                      _id: event.target.value,
                                                    }
                                                  : item,
                                            ),
                                          }),
                                        )
                                      }
                                      placeholder="Project id"
                                    />
                                    <Select
                                      value={String(rating.rating)}
                                      onValueChange={(value) =>
                                        updateCustomFixture(
                                          fixture.id,
                                          (current) => ({
                                            ...current,
                                            ratings: current.ratings.map(
                                              (item, itemIndex) =>
                                                itemIndex === ratingIndex
                                                  ? {
                                                      ...item,
                                                      rating: Number(value),
                                                    }
                                                  : item,
                                            ),
                                          }),
                                        )
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent align="start">
                                        {[3, 2, 1, 0].map((value) => (
                                          <SelectItem
                                            key={`${fixture.id}-${value}`}
                                            value={String(value)}
                                          >
                                            Rating {value}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() =>
                                        updateCustomFixture(
                                          fixture.id,
                                          (current) => ({
                                            ...current,
                                            ratings:
                                              current.ratings.length > 1
                                                ? current.ratings.filter(
                                                    (_, itemIndex) =>
                                                      itemIndex !== ratingIndex,
                                                  )
                                                : [{ _id: "", rating: 3 }],
                                          }),
                                        )
                                      }
                                    >
                                      <Trash2 />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  writeCustomFixturesSnapshot([
                                    ...customFixtures,
                                    createDraftFromFixture(
                                      readyFixture ?? undefined,
                                      {
                                        duplicate: true,
                                      },
                                    ),
                                  ])
                                }
                              >
                                <Copy />
                                Duplicate
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                  writeCustomFixturesSnapshot(
                                    customFixtures.filter(
                                      (item) => item.id !== fixture.id,
                                    ),
                                  )
                                }
                              >
                                <Trash2 />
                                Remove
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
