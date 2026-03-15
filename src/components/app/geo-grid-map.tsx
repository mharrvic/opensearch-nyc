"use client";

import { MapPinned } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GeoBounds, GeoPoint, GeoTileBucket } from "@/lib/types";

type MapPoint = {
  id: string;
  label: string;
  detail?: string | null;
  location: GeoPoint | null;
};

type GeoGridMapProps = {
  bounds: GeoBounds | null;
  tiles: GeoTileBucket[];
  points?: MapPoint[];
  activeBounds?: GeoBounds | null;
  onTileSelect?: (tile: GeoTileBucket) => void;
  emptyMessage?: string;
  className?: string;
};

const viewBoxWidth = 1000;
const viewBoxHeight = 620;

function getBoundsWidth(bounds: GeoBounds) {
  return Math.max(bounds.right - bounds.left, 0.00001);
}

function getBoundsHeight(bounds: GeoBounds) {
  return Math.max(bounds.top - bounds.bottom, 0.00001);
}

function projectPoint(point: GeoPoint, bounds: GeoBounds) {
  const width = getBoundsWidth(bounds);
  const height = getBoundsHeight(bounds);

  return {
    x: ((point.lon - bounds.left) / width) * viewBoxWidth,
    y: ((bounds.top - point.lat) / height) * viewBoxHeight,
  };
}

function areBoundsEqual(left: GeoBounds | null | undefined, right: GeoBounds | null | undefined) {
  if (!left || !right) {
    return false;
  }

  return (
    left.top === right.top &&
    left.left === right.left &&
    left.bottom === right.bottom &&
    left.right === right.right
  );
}

function formatCoordinate(value: number) {
  return value.toFixed(3);
}

export function GeoGridMap({
  bounds,
  tiles,
  points = [],
  activeBounds,
  onTileSelect,
  emptyMessage = "No geo bounds are available for the current result set.",
  className,
}: GeoGridMapProps) {
  if (!bounds) {
    return (
      <div
        className={cn(
          "flex h-[26rem] items-center justify-center rounded-[1.6rem] border border-dashed border-border/80 bg-background/70 px-6 text-center text-sm leading-6 text-muted-foreground",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const maxTileCount = Math.max(...tiles.map((tile) => tile.count), 1);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.8rem] border border-border/80 bg-[radial-gradient(circle_at_top,_color-mix(in_oklch,var(--chart-2)_22%,transparent),transparent_50%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_82%,white),color-mix(in_oklch,var(--muted)_50%,transparent))]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-background/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-background/70 to-transparent" />
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Geo Grid
          </p>
          <p className="text-sm text-muted-foreground">
            {tiles.length.toLocaleString()} tiles · {points.length.toLocaleString()} visible
            points
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          <MapPinned className="size-3.5" />
          {formatCoordinate(bounds.top)}, {formatCoordinate(bounds.left)}
        </Badge>
      </div>

      <div className="relative p-3">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="h-[26rem] w-full rounded-[1.35rem] bg-[linear-gradient(180deg,color-mix(in_oklch,var(--chart-2)_10%,transparent),transparent),repeating-linear-gradient(90deg,color-mix(in_oklch,var(--border)_34%,transparent)_0_1px,transparent_1px_72px),repeating-linear-gradient(0deg,color-mix(in_oklch,var(--border)_34%,transparent)_0_1px,transparent_1px_72px)]"
          role="img"
          aria-label="Geospatial tile grid"
        >
          <rect
            x="0"
            y="0"
            width={viewBoxWidth}
            height={viewBoxHeight}
            fill="transparent"
            rx="28"
          />
          {tiles.map((tile) => {
            const topLeft = projectPoint(
              { lat: tile.bounds.top, lon: tile.bounds.left },
              bounds,
            );
            const bottomRight = projectPoint(
              { lat: tile.bounds.bottom, lon: tile.bounds.right },
              bounds,
            );
            const width = Math.max(bottomRight.x - topLeft.x, 12);
            const height = Math.max(bottomRight.y - topLeft.y, 12);
            const intensity = tile.count / maxTileCount;
            const isActive = areBoundsEqual(tile.bounds, activeBounds);

            return (
              <g key={tile.key}>
                <rect
                  x={topLeft.x}
                  y={topLeft.y}
                  width={width}
                  height={height}
                  rx="10"
                  fill={
                    isActive
                      ? "color-mix(in oklch, var(--accent) 72%, white)"
                      : `color-mix(in oklch, var(--chart-5) ${18 + intensity * 55}%, transparent)`
                  }
                  stroke={
                    isActive
                      ? "color-mix(in oklch, var(--chart-5) 92%, black)"
                      : "color-mix(in oklch, var(--chart-5) 46%, transparent)"
                  }
                  strokeWidth={isActive ? 3 : 1.5}
                  className={cn(
                    "transition-opacity",
                    onTileSelect ? "cursor-pointer hover:opacity-85" : "",
                  )}
                  onClick={() => onTileSelect?.(tile)}
                />
                {width > 66 && height > 28 ? (
                  <text
                    x={topLeft.x + 10}
                    y={topLeft.y + 18}
                    fontSize="14"
                    fill="var(--foreground)"
                    opacity="0.86"
                  >
                    {tile.count}
                  </text>
                ) : null}
              </g>
            );
          })}

          {points.flatMap((point) => {
            if (!point.location) {
              return [];
            }

            const projected = projectPoint(point.location, bounds);

            return [
              <g key={point.id}>
                <circle
                  cx={projected.x}
                  cy={projected.y}
                  r="6.5"
                  fill="color-mix(in oklch, var(--primary) 86%, white)"
                  stroke="color-mix(in oklch, var(--background) 92%, black)"
                  strokeWidth="2.5"
                />
                <circle
                  cx={projected.x}
                  cy={projected.y}
                  r="12"
                  fill="transparent"
                  stroke="color-mix(in oklch, var(--primary) 28%, transparent)"
                  strokeWidth="2"
                />
                <title>{point.label}</title>
              </g>,
            ];
          })}
        </svg>
      </div>
    </div>
  );
}
