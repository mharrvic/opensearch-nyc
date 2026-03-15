import { z } from "zod";

export const analyticsFilterFields = [
  "phase",
  "boroughs",
  "funding_sources",
  "title",
  "location_name",
  "agency",
  "budget_sort",
  "overall_percent_complete",
  "forecast_completion",
  "last_updated",
  "has_coordinates",
] as const;

export const analyticsFilterFieldSchema = z.enum(analyticsFilterFields);
export type AnalyticsFilterField = z.infer<typeof analyticsFilterFieldSchema>;

export const analyticsOptionOperatorSchema = z.enum([
  "any_of",
  "none_of",
  "all_of",
]);
export const analyticsStringOperatorSchema = z.enum([
  "equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
]);
export const analyticsNumberOperatorSchema = z.enum([
  "eq",
  "gt",
  "gte",
  "lt",
  "lte",
]);
export const analyticsDateOperatorSchema = z.enum([
  "on",
  "before",
  "after",
  "on_or_before",
  "on_or_after",
  "is_null",
  "is_not_null",
]);
export const analyticsBooleanOperatorSchema = z.enum(["is"]);

export type AnalyticsOptionOperator = z.infer<
  typeof analyticsOptionOperatorSchema
>;
export type AnalyticsStringOperator = z.infer<
  typeof analyticsStringOperatorSchema
>;
export type AnalyticsNumberOperator = z.infer<
  typeof analyticsNumberOperatorSchema
>;
export type AnalyticsDateOperator = z.infer<typeof analyticsDateOperatorSchema>;
export type AnalyticsBooleanOperator = z.infer<
  typeof analyticsBooleanOperatorSchema
>;

const analyticsOptionsFieldSchema = z.enum([
  "phase",
  "boroughs",
  "funding_sources",
]);
const analyticsStringFieldSchema = z.enum(["title", "location_name", "agency"]);
const analyticsNumberFieldSchema = z.enum([
  "budget_sort",
  "overall_percent_complete",
]);
const analyticsDateFieldSchema = z.enum([
  "forecast_completion",
  "last_updated",
]);
const analyticsBooleanFieldSchema = z.enum(["has_coordinates"]);

const analyticsDateValueSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date in YYYY-MM-DD format.");

export const analyticsOptionsFilterSchema = z.object({
  id: z.string(),
  type: z.literal("options"),
  field: analyticsOptionsFieldSchema,
  operator: analyticsOptionOperatorSchema,
  values: z.array(z.string().trim().min(1)).min(1),
});

export const analyticsStringFilterSchema = z.object({
  id: z.string(),
  type: z.literal("string"),
  field: analyticsStringFieldSchema,
  operator: analyticsStringOperatorSchema,
  value: z.string().trim().min(1),
});

export const analyticsNumberFilterSchema = z.object({
  id: z.string(),
  type: z.literal("number"),
  field: analyticsNumberFieldSchema,
  operator: analyticsNumberOperatorSchema,
  value: z.coerce.number(),
});

export const analyticsDateFilterSchema = z
  .object({
    id: z.string(),
    type: z.literal("date"),
    field: analyticsDateFieldSchema,
    operator: analyticsDateOperatorSchema,
    value: analyticsDateValueSchema.optional(),
  })
  .superRefine((filter, context) => {
    const requiresValue =
      filter.operator !== "is_null" && filter.operator !== "is_not_null";

    if (requiresValue && !filter.value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A date value is required for this operator.",
        path: ["value"],
      });
    }
  });

export const analyticsBooleanFilterSchema = z.object({
  id: z.string(),
  type: z.literal("boolean"),
  field: analyticsBooleanFieldSchema,
  operator: analyticsBooleanOperatorSchema,
  value: z.boolean(),
});

export const analyticsFilterSchema = z.discriminatedUnion("type", [
  analyticsOptionsFilterSchema,
  analyticsStringFilterSchema,
  analyticsNumberFilterSchema,
  analyticsDateFilterSchema,
  analyticsBooleanFilterSchema,
]);

export const analyticsRequestSchema = z.object({
  filters: z.array(analyticsFilterSchema).default([]),
});

export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;

type AnalyticsFieldDefinitionBase = {
  label: string;
  description: string;
  opensearchField: string;
};

type AnalyticsOptionsFieldDefinition = AnalyticsFieldDefinitionBase & {
  type: "options";
  operators: AnalyticsOptionOperator[];
  defaultOperator: AnalyticsOptionOperator;
  options: readonly string[];
  valueKind: "scalar" | "array";
};

type AnalyticsStringFieldDefinition = AnalyticsFieldDefinitionBase & {
  type: "string";
  operators: AnalyticsStringOperator[];
  defaultOperator: AnalyticsStringOperator;
  placeholder: string;
};

type AnalyticsNumberFieldDefinition = AnalyticsFieldDefinitionBase & {
  type: "number";
  operators: AnalyticsNumberOperator[];
  defaultOperator: AnalyticsNumberOperator;
  placeholder: string;
  unit?: "currency" | "percent";
};

type AnalyticsDateFieldDefinition = AnalyticsFieldDefinitionBase & {
  type: "date";
  operators: AnalyticsDateOperator[];
  defaultOperator: AnalyticsDateOperator;
};

type AnalyticsBooleanFieldDefinition = AnalyticsFieldDefinitionBase & {
  type: "boolean";
  operators: AnalyticsBooleanOperator[];
  defaultOperator: AnalyticsBooleanOperator;
};

export type AnalyticsFieldDefinition =
  | AnalyticsOptionsFieldDefinition
  | AnalyticsStringFieldDefinition
  | AnalyticsNumberFieldDefinition
  | AnalyticsDateFieldDefinition
  | AnalyticsBooleanFieldDefinition;

export const analyticsFilterDefinitions: Record<
  AnalyticsFilterField,
  AnalyticsFieldDefinition
> = {
  phase: {
    label: "Phase",
    description: "Delivery phase bucket on the normalized project record.",
    type: "options",
    operators: ["any_of", "none_of"],
    defaultOperator: "any_of",
    options: ["design", "procurement", "construction", "completed", "unknown"],
    valueKind: "scalar",
    opensearchField: "phase",
  },
  boroughs: {
    label: "Borough",
    description: "Borough tags extracted from the source feed.",
    type: "options",
    operators: ["any_of", "none_of", "all_of"],
    defaultOperator: "any_of",
    options: [
      "bronx",
      "brooklyn",
      "manhattan",
      "queens",
      "staten island",
      "citywide",
    ],
    valueKind: "array",
    opensearchField: "boroughs",
  },
  funding_sources: {
    label: "Funding source",
    description: "Named funding sources parsed from the public dataset.",
    type: "options",
    operators: ["any_of", "none_of", "all_of"],
    defaultOperator: "any_of",
    options: [
      "borough president",
      "city council",
      "federal",
      "mayoral",
      "private",
      "state",
    ],
    valueKind: "array",
    opensearchField: "funding_sources",
  },
  title: {
    label: "Title",
    description: "Project title text.",
    type: "string",
    operators: ["equals", "contains", "not_contains", "starts_with", "ends_with"],
    defaultOperator: "contains",
    placeholder: "playground reconstruction",
    opensearchField: "title.keyword",
  },
  location_name: {
    label: "Location",
    description: "Normalized park or location name.",
    type: "string",
    operators: ["equals", "contains", "not_contains", "starts_with", "ends_with"],
    defaultOperator: "contains",
    placeholder: "astoria park",
    opensearchField: "location_name.keyword",
  },
  agency: {
    label: "Agency",
    description: "Owning agency.",
    type: "string",
    operators: ["equals", "contains", "not_contains", "starts_with", "ends_with"],
    defaultOperator: "equals",
    placeholder: "nyc parks",
    opensearchField: "agency",
  },
  budget_sort: {
    label: "Budget proxy",
    description: "Numeric midpoint derived from the source budget band.",
    type: "number",
    operators: ["eq", "gt", "gte", "lt", "lte"],
    defaultOperator: "gte",
    placeholder: "10000000",
    unit: "currency",
    opensearchField: "budget_sort",
  },
  overall_percent_complete: {
    label: "Completion percent",
    description: "Highest reported percent complete across phases.",
    type: "number",
    operators: ["eq", "gt", "gte", "lt", "lte"],
    defaultOperator: "gte",
    placeholder: "50",
    unit: "percent",
    opensearchField: "overall_percent_complete",
  },
  forecast_completion: {
    label: "Forecast completion",
    description: "Resolved date used for the yearly timeline.",
    type: "date",
    operators: [
      "on",
      "before",
      "after",
      "on_or_before",
      "on_or_after",
      "is_null",
      "is_not_null",
    ],
    defaultOperator: "on_or_after",
    opensearchField: "forecast_completion",
  },
  last_updated: {
    label: "Last updated",
    description: "Latest source update date.",
    type: "date",
    operators: [
      "on",
      "before",
      "after",
      "on_or_before",
      "on_or_after",
      "is_null",
      "is_not_null",
    ],
    defaultOperator: "on_or_after",
    opensearchField: "last_updated",
  },
  has_coordinates: {
    label: "Has coordinates",
    description: "Whether the document includes a valid geo point.",
    type: "boolean",
    operators: ["is"],
    defaultOperator: "is",
    opensearchField: "has_coordinates",
  },
};

export const analyticsFilterOperatorLabels = {
  any_of: "any of",
  none_of: "none of",
  all_of: "all of",
  equals: "equals",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  eq: "=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  on: "on",
  before: "before",
  after: "after",
  on_or_before: "on or before",
  on_or_after: "on or after",
  is_null: "is null",
  is_not_null: "is not null",
  is: "is",
} as const;

type AnalyticsOptionsFilterDraft = {
  id: string;
  type: "options";
  field: z.infer<typeof analyticsOptionsFieldSchema>;
  operator: AnalyticsOptionOperator;
  values: string[];
};

type AnalyticsStringFilterDraft = {
  id: string;
  type: "string";
  field: z.infer<typeof analyticsStringFieldSchema>;
  operator: AnalyticsStringOperator;
  value: string;
};

type AnalyticsNumberFilterDraft = {
  id: string;
  type: "number";
  field: z.infer<typeof analyticsNumberFieldSchema>;
  operator: AnalyticsNumberOperator;
  value: string;
};

type AnalyticsDateFilterDraft = {
  id: string;
  type: "date";
  field: z.infer<typeof analyticsDateFieldSchema>;
  operator: AnalyticsDateOperator;
  value: string;
};

type AnalyticsBooleanFilterDraft = {
  id: string;
  type: "boolean";
  field: z.infer<typeof analyticsBooleanFieldSchema>;
  operator: AnalyticsBooleanOperator;
  value: boolean;
};

export type AnalyticsFilterDraft =
  | AnalyticsOptionsFilterDraft
  | AnalyticsStringFilterDraft
  | AnalyticsNumberFilterDraft
  | AnalyticsDateFilterDraft
  | AnalyticsBooleanFilterDraft;

function createDraftId() {
  return crypto.randomUUID();
}

export function createAnalyticsFilterDraft(
  field: AnalyticsFilterField = "phase",
  id = createDraftId(),
): AnalyticsFilterDraft {
  const definition = analyticsFilterDefinitions[field];

  switch (definition.type) {
    case "options":
      return {
        id,
        type: "options",
        field: field as z.infer<typeof analyticsOptionsFieldSchema>,
        operator: definition.defaultOperator,
        values: [],
      };
    case "string":
      return {
        id,
        type: "string",
        field: field as z.infer<typeof analyticsStringFieldSchema>,
        operator: definition.defaultOperator,
        value: "",
      };
    case "number":
      return {
        id,
        type: "number",
        field: field as z.infer<typeof analyticsNumberFieldSchema>,
        operator: definition.defaultOperator,
        value: "",
      };
    case "date":
      return {
        id,
        type: "date",
        field: field as z.infer<typeof analyticsDateFieldSchema>,
        operator: definition.defaultOperator,
        value: "",
      };
    case "boolean":
      return {
        id,
        type: "boolean",
        field: field as z.infer<typeof analyticsBooleanFieldSchema>,
        operator: definition.defaultOperator,
        value: true,
      };
  }
}

export function isAnalyticsFilterDraftComplete(filter: AnalyticsFilterDraft) {
  switch (filter.type) {
    case "options":
      return filter.values.length > 0;
    case "string":
      return filter.value.trim().length > 0;
    case "number":
      return filter.value.trim().length > 0 && Number.isFinite(Number(filter.value));
    case "date":
      return filter.operator === "is_null" || filter.operator === "is_not_null"
        ? true
        : /^\d{4}-\d{2}-\d{2}$/.test(filter.value);
    case "boolean":
      return true;
  }
}

export function toAnalyticsFilter(filter: AnalyticsFilterDraft): AnalyticsFilter {
  switch (filter.type) {
    case "options":
      return analyticsOptionsFilterSchema.parse({
        ...filter,
        values: filter.values.map((value) => value.trim()).filter(Boolean),
      });
    case "string":
      return analyticsStringFilterSchema.parse({
        ...filter,
        value: filter.value.trim(),
      });
    case "number":
      return analyticsNumberFilterSchema.parse({
        ...filter,
        value: filter.value,
      });
    case "date":
      return analyticsDateFilterSchema.parse({
        ...filter,
        value:
          filter.operator === "is_null" || filter.operator === "is_not_null"
            ? undefined
            : filter.value,
      });
    case "boolean":
      return analyticsBooleanFilterSchema.parse(filter);
  }
}
