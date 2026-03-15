const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function trimTrailingZero(value: string) {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

function formatCompactMagnitude(value: number) {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const units = [
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ] as const;

  for (const unit of units) {
    if (absoluteValue >= unit.threshold) {
      const scaled = absoluteValue / unit.threshold;
      const precision = scaled >= 10 ? 0 : 1;
      return `${sign}${trimTrailingZero(scaled.toFixed(precision))}${unit.suffix}`;
    }
  }

  return `${value}`;
}

export function formatCurrencyRange(min: number, max: number | null, band: string) {
  if (band && !band.startsWith("$")) {
    return band;
  }

  if (max === null) {
    return `${currencyFormatter.format(min)}+`;
  }

  if (min === max) {
    return currencyFormatter.format(min);
  }

  return `${currencyFormatter.format(min)} - ${currencyFormatter.format(max)}`;
}

export function formatShortDate(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatCompactCurrency(value: number) {
  if (Math.abs(value) < 1_000) {
    return currencyFormatter.format(value);
  }

  return `${value < 0 ? "-" : ""}$${formatCompactMagnitude(Math.abs(value))}`;
}

export function formatCompactNumber(value: number) {
  if (Math.abs(value) < 1_000) {
    return Math.round(value).toLocaleString("en-US");
  }

  return formatCompactMagnitude(value);
}
