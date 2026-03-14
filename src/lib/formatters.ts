const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
