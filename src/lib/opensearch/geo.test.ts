import { describe, expect, it } from "vitest";

import {
  parseGeoBounds,
  parseGeoTileBuckets,
  tileKeyToBounds,
  toOpenSearchBounds,
} from "@/lib/opensearch/geo";

describe("geo helpers", () => {
  it("converts geotile keys into viewport bounds", () => {
    expect(tileKeyToBounds("0/0/0")).toEqual({
      top: 85.0511287798066,
      left: -180,
      bottom: -85.0511287798066,
      right: 180,
    });
  });

  it("parses geo bounds aggregations", () => {
    expect(
      parseGeoBounds({
        bounds: {
          top_left: {
            lat: 40.82,
            lon: -74.03,
          },
          bottom_right: {
            lat: 40.61,
            lon: -73.75,
          },
        },
      }),
    ).toEqual({
      top: 40.82,
      left: -74.03,
      bottom: 40.61,
      right: -73.75,
    });
  });

  it("parses tile buckets and discards invalid keys", () => {
    const buckets = parseGeoTileBuckets({
      buckets: [
        {
          key: "7/37/48",
          doc_count: 12,
        },
        {
          key: "bad-key",
          doc_count: 3,
        },
      ],
    });

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      key: "7/37/48",
      count: 12,
      center: expect.objectContaining({
        lat: expect.any(Number),
        lon: expect.any(Number),
      }),
    });
  });

  it("translates UI bounds into OpenSearch bounds", () => {
    expect(
      toOpenSearchBounds({
        top: 40.82,
        left: -74.03,
        bottom: 40.61,
        right: -73.75,
      }),
    ).toEqual({
      top_left: {
        lat: 40.82,
        lon: -74.03,
      },
      bottom_right: {
        lat: 40.61,
        lon: -73.75,
      },
    });
  });
});
