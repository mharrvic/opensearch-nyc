import type { RelevanceFixture } from "@/lib/types";

export const relevanceFixtures: RelevanceFixture[] = [
  {
    id: "playground-queens",
    label: "Queens playground reconstruction",
    query: "queens playground reconstruction",
    ratings: [
      { _id: "1023", rating: 3 },
      { _id: "1022", rating: 2 },
      { _id: "10438", rating: 2 },
      { _id: "1004111", rating: 1 },
    ],
  },
  {
    id: "waterfront-queens",
    label: "Queens waterfront reconstruction",
    query: "queens waterfront reconstruction",
    ratings: [
      { _id: "9841", rating: 3 },
      { _id: "9354", rating: 3 },
      { _id: "9510", rating: 2 },
      { _id: "1021", rating: 1 },
    ],
  },
  {
    id: "coastal-resiliency",
    label: "Manhattan coastal resiliency",
    query: "manhattan coastal resiliency",
    ratings: [
      { _id: "9993", rating: 3 },
      { _id: "10030", rating: 3 },
      { _id: "9375", rating: 1 },
    ],
  },
];
