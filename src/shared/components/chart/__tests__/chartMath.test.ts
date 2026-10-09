import {
  alignSeries,
  chartModel,
  DEFAULT_CHART_SETTINGS,
  chartStats,
  comparisonPoints,
  decimalsFor,
  downsample,
  filterRange,
  goalEta,
  rangeWindow,
  recordIndices,
  toCsv,
  trendValues,
  xLabels,
  yBounds,
  type ChartPoint,
} from "../chartMath";

const day = (d: number, value: number): ChartPoint => ({
  date: new Date(2026, 0, d, 9),
  value,
});

describe("rangeWindow / filterRange", () => {
  const now = new Date(2026, 0, 31, 15);

  it("1W keeps today and the six days before it", () => {
    const points = [day(24, 1), day(25, 2), day(31, 3)];
    expect(filterRange(points, { range: "1W" }, now).map((p) => p.value)).toEqual([2, 3]);
  });

  it("all keeps everything", () => {
    expect(rangeWindow({ range: "all" }, now)).toEqual({ from: null, to: null });
  });

  it("custom includes both end days and ignores a bad bound", () => {
    const points = [day(9, 1), day(10, 2), day(12, 3), day(13, 4)];
    const custom = { range: "custom" as const, customFrom: "2026-01-10", customTo: "2026-01-12" };
    expect(filterRange(points, custom, now).map((p) => p.value)).toEqual([2, 3]);
    expect(
      filterRange(points, { ...custom, customFrom: "nope" }, now).map((p) => p.value),
    ).toEqual([1, 2, 3]);
  });
});

describe("trendValues", () => {
  it("averages the trailing seven days only", () => {
    const points = [day(1, 10), day(2, 20), day(9, 30)];
    expect(trendValues(points, "ma7")).toEqual([10, 15, 30]);
  });

  it("moves 10% of the way toward each new point for ema", () => {
    expect(trendValues([day(1, 100), day(2, 110)], "ema")).toEqual([100, 101]);
  });
});

describe("recordIndices", () => {
  it("marks only points that beat every earlier one", () => {
    const points = [day(1, 100), day(2, 90), day(3, 105), day(4, 105), day(5, 110)];
    expect([...recordIndices(points)]).toEqual([2, 4]);
  });
});

describe("comparisonPoints", () => {
  const all = [day(1, 1), day(3, 2), day(5, 3), day(7, 4), day(9, 5)];

  it("shifts the previous period of equal length onto the visible one", () => {
    const visible = [day(5, 3), day(7, 4), day(9, 5)];
    const prev = comparisonPoints(all, visible, "previous");
    expect(prev.map((p) => p.value)).toEqual([1, 2, 3]);
    expect(prev[0].date.getDate()).toBe(5);
  });

  it("is empty when off", () => {
    expect(comparisonPoints(all, all, "off")).toEqual([]);
  });
});

describe("alignSeries", () => {
  it("puts both series on one day axis with gaps as null", () => {
    const { dates, values } = alignSeries([
      [day(1, 1), day(3, 3)],
      [day(2, 20), day(3, 30)],
    ]);
    expect(dates.map((d) => d.getDate())).toEqual([1, 2, 3]);
    expect(values).toEqual([
      [1, null, 3],
      [null, 20, 30],
    ]);
  });
});

describe("chartStats", () => {
  it("returns min, max, average and change", () => {
    expect(chartStats([day(1, 80), day(2, 84), day(3, 82)])).toEqual({
      min: 80,
      max: 84,
      average: 82,
      change: 2,
    });
    expect(chartStats([])).toBeNull();
  });
});

describe("goalEta", () => {
  it("projects a steady loss forward to the goal", () => {
    const points = [day(1, 90), day(11, 89), day(21, 88)];
    const eta = goalEta(points, 85)!;
    expect([eta.getMonth(), eta.getDate()]).toEqual([1, 20]);
  });

  it("is null when moving away from the goal", () => {
    expect(goalEta([day(1, 80), day(2, 81)], 70)).toBeNull();
  });
});

describe("yBounds", () => {
  it("rounds an auto axis out to nice steps around the data", () => {
    expect(yBounds([80.4, 83.2], { yAxis: "auto" })).toEqual({ min: 80, max: 84, step: 1, sections: 4 });
  });

  it("starts at zero when asked", () => {
    expect(yBounds([80, 100], { yAxis: "zero" }).min).toBe(0);
  });

  it("uses manual bounds as given and ignores inverted ones", () => {
    expect(yBounds([5], { yAxis: "manual", yMin: 0, yMax: 200 })).toEqual({ min: 0, max: 200, step: 50, sections: 4 });
    expect(yBounds([5, 6], { yAxis: "manual", yMin: 10, yMax: 1 }).min).toBe(5);
  });

  it("gives a flat series some height", () => {
    const b = yBounds([50, 50], { yAxis: "auto" });
    expect(b.max).toBeGreaterThan(b.min);
  });
});

describe("decimalsFor", () => {
  it("drops decimals for wide whole-number ranges only", () => {
    expect(decimalsFor([1000, 12500])).toBe(0);
    expect(decimalsFor([80, 82])).toBe(1);
  });
});

describe("xLabels", () => {
  it("labels at most the requested count", () => {
    const dates = Array.from({ length: 30 }, (_, i) => new Date(2026, 0, i + 1));
    expect(xLabels(dates, 6).filter(Boolean)).toHaveLength(6);
  });
});

describe("downsample", () => {
  it("caps points while keeping the peak and the latest", () => {
    const points = Array.from({ length: 300 }, (_, i) => ({ value: i === 137 ? 999 : i % 10 }));
    const kept = downsample(points, 60);
    expect(kept.length).toBeLessThanOrEqual(60);
    expect(kept.map((p) => p.value)).toContain(999);
    expect(kept.at(-1)).toBe(points.at(-1));
  });
});

describe("toCsv", () => {
  it("writes one dated row per point", () => {
    expect(toCsv([day(2, 80.5)], "Weight, kg")).toBe("date,Weight  kg\n2026-01-02,80.5");
  });
});

describe("chartModel", () => {
  const settings = { ...DEFAULT_CHART_SETTINGS, range: "all" as const };

  it("marks records and widens the axis to include the goal", () => {
    const model = chartModel([day(1, 80), day(2, 85), day(3, 84)], {
      ...settings,
      showPRs: true,
      goal: 70,
    });
    expect([...model.records]).toEqual([1]);
    expect(model.bounds.min).toBeLessThanOrEqual(70);
    expect(model.pointAt[2]?.value).toBe(84);
  });

  it("adds trend and compare series on the same slots", () => {
    const points = [day(1, 1), day(2, 2), day(3, 3), day(4, 4)];
    const model = chartModel(points, {
      ...settings,
      range: "custom",
      customFrom: "2026-01-03",
      customTo: "2026-01-04",
      trend: "ma7",
      compare: "previous",
    });
    expect(model.main).toEqual([3, 4]);
    expect(model.trend).toEqual([3, 3.5]);
    expect(model.compare).toEqual([2, 3]);
  });
});
