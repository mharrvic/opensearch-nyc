import { describe, expect, it } from "vitest";

import {
  normalizeCapitalProject,
  nycParksTestUtils,
  type NYCParksCapitalProjectRow,
} from "@/lib/nyc-parks";

describe("nyc parks normalization", () => {
  it("extracts concatenated funding sources and boroughs", () => {
    expect(
      nycParksTestUtils.extractNamedTokens(
        "Borough PresidentCity CouncilMayoral",
        ["Borough President", "City Council", "Mayoral", "Federal"],
      ),
    ).toEqual(["Borough President", "City Council", "Mayoral"]);

    expect(
      nycParksTestUtils.extractNamedTokens(
        "QueensManhattanStaten IslandBrooklynBronx",
        [
          "Bronx",
          "Brooklyn",
          "Manhattan",
          "Queens",
          "Staten Island",
          "Citywide",
        ],
      ),
    ).toEqual([
      "Bronx",
      "Brooklyn",
      "Manhattan",
      "Queens",
      "Staten Island",
    ]);
  });

  it("parses named budget ranges into numeric values", () => {
    expect(
      nycParksTestUtils.parseBudgetRange("Between $5 million and $10 million"),
    ).toEqual({
      budgetBand: "Between $5 million and $10 million",
      budgetMin: 5_000_000,
      budgetMax: 10_000_000,
      budgetSort: 7_500_000,
    });
  });

  it("normalizes a public project row into the search document shape", () => {
    const row: NYCParksCapitalProjectRow = {
      trackerid: "9578",
      title: "A. Philip Randolph Square Reconstruction",
      summary:
        "This project will reconstruct A. Philip Randolph Square and adjacent sidewalks and intersections.",
      currentphase: "design",
      designpercentcomplete: "50.0",
      procurementpercentcomplete: "0.0",
      constructionpercentcomplete: "0.0",
      designstart: "2024-10-01T00:00:00.000",
      designprojectedcompletion: "2026-04-01T00:00:00.000",
      designadjustedcompletion: "2026-10-01T00:00:00.000",
      totalfunding: "Greater than $10 million",
      projectliaison: "Steve Simon",
      lastupdated: "2026-03-13T00:00:00.000",
      fundingsource: "Borough PresidentCity CouncilMayoral",
      name: "Adam Clayton Powell Jr. Boulevard, St. Nicholas Avenue, West 117th Street",
      parkid: "M021",
      latitude: "40.803901",
      longitude: "-73.952413",
      borough: "Manhattan",
    };

    const document = normalizeCapitalProject(row);

    expect(document.project_id).toBe("9578");
    expect(document.phase).toBe("design");
    expect(document.funding_sources).toEqual([
      "Borough President",
      "City Council",
      "Mayoral",
    ]);
    expect(document.boroughs).toEqual(["Manhattan"]);
    expect(document.forecast_completion).toBe("2026-10-01");
    expect(document.has_coordinates).toBe(true);
    expect(document.search_text).toContain("A. Philip Randolph Square Reconstruction");
  });
});
