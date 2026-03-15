"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  analyticsFilterDefinitions,
  analyticsFilterFields,
  analyticsFilterOperatorLabels,
  type AnalyticsFilter,
  type AnalyticsFilterDraft,
  type AnalyticsFilterField,
} from "@/lib/analytics-filters";
import type { AnalyticsSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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

function formatTokenLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getBucketEntries(field: AnalyticsFilterField, snapshot: AnalyticsSnapshot) {
  switch (field) {
    case "phase":
      return snapshot.phaseCounts;
    case "boroughs":
      return snapshot.boroughCounts;
    case "funding_sources":
      return snapshot.fundingCounts;
    default:
      return [];
  }
}

function getOptionsForField(
  field: AnalyticsFilterField,
  snapshot: AnalyticsSnapshot,
  selectedValues: string[],
) {
  const definition = analyticsFilterDefinitions[field];

  if (definition.type !== "options") {
    return [];
  }

  const values = new Set<string>(definition.options);

  for (const bucket of getBucketEntries(field, snapshot)) {
    values.add(bucket.value);
  }

  for (const selectedValue of selectedValues) {
    values.add(selectedValue);
  }

  return [...values].sort((left, right) => left.localeCompare(right));
}

function getOptionCountMap(field: AnalyticsFilterField, snapshot: AnalyticsSnapshot) {
  return new Map(
    getBucketEntries(field, snapshot).map((bucket) => [bucket.value, bucket.count]),
  );
}

function summarizeFilter(filter: AnalyticsFilter) {
  const definition = analyticsFilterDefinitions[filter.field];
  const operatorLabel = analyticsFilterOperatorLabels[filter.operator];

  switch (filter.type) {
    case "options":
      return `${definition.label} ${operatorLabel} ${filter.values
        .map(formatTokenLabel)
        .join(", ")}`;
    case "string":
      return `${definition.label} ${operatorLabel} "${filter.value}"`;
    case "number":
      return `${definition.label} ${operatorLabel} ${filter.value}`;
    case "date":
      return filter.operator === "is_null" || filter.operator === "is_not_null"
        ? `${definition.label} ${operatorLabel}`
        : `${definition.label} ${operatorLabel} ${filter.value}`;
    case "boolean":
      return `${definition.label} is ${filter.value ? "true" : "false"}`;
  }
}

function OptionValueEditor({
  filter,
  snapshot,
  onChange,
}: {
  filter: Extract<AnalyticsFilterDraft, { type: "options" }>;
  snapshot: AnalyticsSnapshot;
  onChange: (filter: AnalyticsFilterDraft) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const options = useMemo(
    () =>
      getOptionsForField(filter.field, snapshot, filter.values).filter((value) =>
        formatTokenLabel(value).toLowerCase().includes(deferredSearch.toLowerCase()),
      ),
    [deferredSearch, filter.field, filter.values, snapshot],
  );
  const countMap = useMemo(
    () => getOptionCountMap(filter.field, snapshot),
    [filter.field, snapshot],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter option values"
          className="h-9 bg-background/80"
        />
        <Badge variant="outline">{filter.values.length} selected</Badge>
      </div>
      {filter.values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {filter.values.map((value) => (
            <button
              key={value}
              type="button"
              className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs text-foreground transition hover:border-border/80 hover:bg-muted"
              onClick={() =>
                onChange({
                  ...filter,
                  values: filter.values.filter((item) => item !== value),
                })
              }
            >
              {formatTokenLabel(value)}
            </button>
          ))}
        </div>
      ) : null}
      <ScrollArea className="h-44 rounded-xl border bg-background/70">
        <div className="grid gap-1.5 p-2">
          {options.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">
              No values match this search.
            </div>
          ) : (
            options.map((value) => {
              const checked = filter.values.includes(value);

              return (
                <label
                  key={value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        onChange({
                          ...filter,
                          values: nextChecked
                            ? [...filter.values, value]
                            : filter.values.filter((item) => item !== value),
                        })
                      }
                    />
                    <span className="text-sm text-foreground">
                      {formatTokenLabel(value)}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {countMap.get(value)?.toLocaleString() ?? "0"}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FilterRow({
  filter,
  snapshot,
  onFieldChange,
  onChange,
  onRemove,
}: {
  filter: AnalyticsFilterDraft;
  snapshot: AnalyticsSnapshot;
  onFieldChange: (id: string, field: AnalyticsFilterField) => void;
  onChange: (filter: AnalyticsFilterDraft) => void;
  onRemove: (id: string) => void;
}) {
  const definition = analyticsFilterDefinitions[filter.field];

  return (
    <div className="rounded-2xl border border-border/80 bg-background/75 p-4 shadow-[0_14px_35px_-28px_rgba(15,23,42,0.55)]">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="space-y-2">
          <Label>Field</Label>
          <Select
            value={filter.field}
            onValueChange={(value) =>
              onFieldChange(filter.id, value as AnalyticsFilterField)
            }
          >
            <SelectTrigger className="h-10 bg-background/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {analyticsFilterFields.map((field) => (
                <SelectItem key={field} value={field}>
                  {analyticsFilterDefinitions[field].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            {definition.description}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Operation</Label>
          <Select
            value={filter.operator}
            onValueChange={(value) => onChange({ ...filter, operator: value } as never)}
          >
            <SelectTrigger className="h-10 bg-background/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {definition.operators.map((operator) => (
                <SelectItem key={operator} value={operator}>
                  {analyticsFilterOperatorLabels[operator]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 bg-background/90"
            onClick={() => onRemove(filter.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label>Value</Label>
        {filter.type === "options" ? (
          <OptionValueEditor
            filter={filter}
            snapshot={snapshot}
            onChange={onChange}
          />
        ) : null}
        {filter.type === "string" ? (
          <Input
            value={filter.value}
            onChange={(event) =>
              onChange({ ...filter, value: event.target.value })
            }
            placeholder={definition.type === "string" ? definition.placeholder : ""}
            className="h-10 bg-background/80"
          />
        ) : null}
        {filter.type === "number" ? (
          <Input
            type="number"
            inputMode="decimal"
            value={filter.value}
            onChange={(event) =>
              onChange({ ...filter, value: event.target.value })
            }
            placeholder={definition.type === "number" ? definition.placeholder : ""}
            className="h-10 bg-background/80"
          />
        ) : null}
        {filter.type === "date" ? (
          filter.operator === "is_null" || filter.operator === "is_not_null" ? (
            <div className="rounded-xl border border-dashed bg-background/70 px-3 py-3 text-sm text-muted-foreground">
              This operator does not require a date value.
            </div>
          ) : (
            <Input
              type="date"
              value={filter.value}
              onChange={(event) =>
                onChange({ ...filter, value: event.target.value })
              }
              className="h-10 bg-background/80"
            />
          )
        ) : null}
        {filter.type === "boolean" ? (
          <Select
            value={filter.value ? "true" : "false"}
            onValueChange={(value) =>
              onChange({ ...filter, value: value === "true" })
            }
          >
            <SelectTrigger className="h-10 bg-background/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">True</SelectItem>
              <SelectItem value="false">False</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </div>
  );
}

export function AnalyticsFilterBuilder({
  snapshot,
  draftFilters,
  appliedFilters,
  isPending,
  hasIncompleteFilters,
  onAddFilter,
  onFieldChange,
  onChangeFilter,
  onRemoveFilter,
  onApply,
  onClear,
}: {
  snapshot: AnalyticsSnapshot;
  draftFilters: AnalyticsFilterDraft[];
  appliedFilters: AnalyticsFilter[];
  isPending: boolean;
  hasIncompleteFilters: boolean;
  onAddFilter: () => void;
  onFieldChange: (id: string, field: AnalyticsFilterField) => void;
  onChangeFilter: (filter: AnalyticsFilterDraft) => void;
  onRemoveFilter: (id: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <Card className="dashboard-panel border-border/80">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-chart-2" />
              Analytics filters
            </CardTitle>
            <CardDescription>
              Build an ANDed filter stack across categorical, text, numeric,
              date, and boolean fields.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddFilter}
              className="bg-background/90"
            >
              <Plus className="size-4" />
              Add filter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={draftFilters.length === 0 && appliedFilters.length === 0}
              className="bg-background/90"
            >
              Clear all
            </Button>
            <Button
              size="sm"
              onClick={onApply}
              disabled={isPending || hasIncompleteFilters}
            >
              Apply filters
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <div className="space-y-4">
          {draftFilters.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-background/70 px-6 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                No filters configured yet.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Start with phase, borough, funding source, budget, completion,
                forecast dates, or free-text title filters.
              </p>
            </div>
          ) : (
            draftFilters.map((filter) => (
              <FilterRow
                key={filter.id}
                filter={filter}
                snapshot={snapshot}
                onFieldChange={onFieldChange}
                onChange={onChangeFilter}
                onRemove={onRemoveFilter}
              />
            ))
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Current behavior
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">
                {appliedFilters.length} applied
              </Badge>
              <Badge variant="outline">
                {draftFilters.length} draft rows
              </Badge>
              {hasIncompleteFilters ? (
                <Badge variant="outline" className="border-chart-5/40 text-chart-5">
                  incomplete rows
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Every filter row is combined with AND semantics before OpenSearch
              runs the analytics aggregations. The KPI cards, bucket counts, and
              charts all update together from the filtered slice.
            </p>
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Applied slice
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {appliedFilters.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No filters applied. Analytics show the full seeded dataset.
                </span>
              ) : (
                appliedFilters.map((filter) => (
                  <Badge
                    key={filter.id}
                    variant="outline"
                    className={cn(
                      "rounded-full px-2.5 py-1 text-left leading-5 whitespace-normal",
                    )}
                  >
                    {summarizeFilter(filter)}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
