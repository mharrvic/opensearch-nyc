import type { GeoBounds, GeoPoint, GeoTileBucket } from "@/lib/types";

type GeoPointAggregation = {
  lat?: number | null;
  lon?: number | null;
};

type GeoBoundsAggregation = {
  bounds?: {
    top_left?: GeoPointAggregation;
    bottom_right?: GeoPointAggregation;
  };
};

type GeoTileAggregationBucket = {
  key: string | number;
  doc_count: number;
};

type GeoTileAggregation = {
  buckets?: GeoTileAggregationBucket[];
};

function tileYToLatitude(tileY: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * tileY) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileKeyToBounds(key: string): GeoBounds | null {
  const [zoomText, xText, yText] = key.split("/");
  const zoom = Number(zoomText);
  const x = Number(xText);
  const y = Number(yText);

  if (![zoom, x, y].every(Number.isFinite)) {
    return null;
  }

  const tileCount = 2 ** zoom;
  const left = (x / tileCount) * 360 - 180;
  const right = ((x + 1) / tileCount) * 360 - 180;
  const top = tileYToLatitude(y, zoom);
  const bottom = tileYToLatitude(y + 1, zoom);

  return {
    top,
    left,
    bottom,
    right,
  };
}

export function getGeoBoundsCenter(bounds: GeoBounds): GeoPoint {
  return {
    lat: (bounds.top + bounds.bottom) / 2,
    lon: (bounds.left + bounds.right) / 2,
  };
}

export function parseGeoBounds(
  aggregation: GeoBoundsAggregation | undefined,
): GeoBounds | null {
  const topLeft = aggregation?.bounds?.top_left;
  const bottomRight = aggregation?.bounds?.bottom_right;

  if (
    typeof topLeft?.lat !== "number" ||
    typeof topLeft.lon !== "number" ||
    typeof bottomRight?.lat !== "number" ||
    typeof bottomRight.lon !== "number"
  ) {
    return null;
  }

  return {
    top: topLeft.lat,
    left: topLeft.lon,
    bottom: bottomRight.lat,
    right: bottomRight.lon,
  };
}

export function parseGeoTileBuckets(
  aggregation: GeoTileAggregation | undefined,
): GeoTileBucket[] {
  return (
    aggregation?.buckets?.flatMap((bucket) => {
      const bounds = tileKeyToBounds(String(bucket.key));

      if (!bounds) {
        return [];
      }

      return [
        {
          key: String(bucket.key),
          count: bucket.doc_count,
          bounds,
          center: getGeoBoundsCenter(bounds),
        },
      ];
    }) ?? []
  );
}

export function toOpenSearchBounds(bounds: GeoBounds) {
  return {
    top_left: {
      lat: bounds.top,
      lon: bounds.left,
    },
    bottom_right: {
      lat: bounds.bottom,
      lon: bounds.right,
    },
  };
}
