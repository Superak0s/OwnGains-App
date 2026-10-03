import { toDefaultWidgets, type WidgetDefinition } from "@shared/types";

type T = "weight_overview" | "weight_chart" | "weight_history";

const registry: Record<T, WidgetDefinition<T>> = {
  weight_overview: {
    type: "weight_overview",
    description: "",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  weight_chart: {
    type: "weight_chart",
    description: "",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  weight_history: {
    type: "weight_history",
    description: "",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
};

describe("toDefaultWidgets", () => {
  // Ids are matched against layouts already persisted on users' devices, so
  // the underscore-to-hyphen derivation must not drift.
  it("derives the persisted id from the widget type", () => {
    expect(toDefaultWidgets(registry, ["weight_overview"])[0].id).toBe(
      "default-weight-overview",
    );
  });

  it("takes each widget's size from the registry and orders by position", () => {
    expect(toDefaultWidgets(registry, ["weight_chart", "weight_overview"])).toEqual([
      {
        id: "default-weight-chart",
        type: "weight_chart",
        size: "large",
        order: 0,
      },
      {
        id: "default-weight-overview",
        type: "weight_overview",
        size: "medium",
        order: 1,
      },
    ]);
  });

  it("places only the types it is given, not the whole registry", () => {
    expect(toDefaultWidgets(registry, ["weight_history"])).toHaveLength(1);
  });
});
