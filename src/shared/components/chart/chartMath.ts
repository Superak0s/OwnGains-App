import { DAY_MS, formatDate, toDateString } from "@utils/format";

export interface ChartPoint {
  date: Date;
  value: number;
  /** Bar charts only. */
  color?: string;
}

export const CHART_RANGES = ["1W", "1M", "3M", "6M", "1Y", "all", "custom"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export type ChartKind = "line" | "area" | "bar";
export type YAxisMode = "auto" | "zero" | "manual";
export type TrendMode = "off" | "ma7" | "ema";
export type CompareMode = "off" | "previous" | "lastYear";

export interface ChartSettings {
  range: ChartRange;
  /** YYYY-MM-DD, used when range is "custom". */
  customFrom?: string;
  customTo?: string;
  kind: ChartKind;
  yAxis: YAxisMode;
  yMin?: number;
  yMax?: number;
  xLabels: number;
  fontSize: number;
  showDots: boolean;
  showRaw: boolean;
  trend: TrendMode;
  goal?: number;
  /** Shows the expected values from today to the goal date instead of the logged history. */
  projection: boolean;
  showPRs: boolean;
  compare: CompareMode;
  metric?: string;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  range: "all",
  kind: "line",
  yAxis: "auto",
  xLabels: 6,
  fontSize: 10,
  showDots: true,
  showRaw: true,
  trend: "off",
  projection: false,
  showPRs: false,
  compare: "off",
};


const RANGE_DAYS: Partial<Record<ChartRange, number>> = {
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
};

const parseDay = (day: string | undefined, endOfDay = false): Date | null => {
  const match = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The visible window, or null at either end for an open bound. */
export function rangeWindow(
  settings: Pick<ChartSettings, "range" | "customFrom" | "customTo">,
  now: Date = new Date(),
): { from: Date | null; to: Date | null } {
  if (settings.range === "custom")
    return {
      from: parseDay(settings.customFrom),
      to: parseDay(settings.customTo, true),
    };
  const days = RANGE_DAYS[settings.range];
  if (!days) return { from: null, to: null };
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: null };
}

export function filterRange(
  points: ChartPoint[],
  settings: Pick<ChartSettings, "range" | "customFrom" | "customTo">,
  now: Date = new Date(),
): ChartPoint[] {
  const { from, to } = rangeWindow(settings, now);
  return points.filter(
    (p) => (!from || p.date >= from) && (!to || p.date <= to),
  );
}

/** Trailing 7 day average, or an exponential average with the Hacker's Diet 10% smoothing. */
export function trendValues(points: ChartPoint[], mode: TrendMode): number[] {
  if (mode === "ema") {
    let ema = points[0]?.value ?? 0;
    return points.map((p) => (ema += 0.1 * (p.value - ema)));
  }
  return points.map((p, i) => {
    const since = p.date.getTime() - 7 * DAY_MS;
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0 && points[j].date.getTime() > since; j--) {
      sum += points[j].value;
      count++;
    }
    return sum / count;
  });
}

/** Indices of points that beat every earlier point. The first point is a baseline, not a record. */
export function recordIndices(points: ChartPoint[]): Set<number> {
  const records = new Set<number>();
  let best = points[0]?.value ?? 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > best) {
      best = points[i].value;
      records.add(i);
    }
  }
  return records;
}

/**
 * The earlier period's points with dates moved forward onto the visible
 * window, so both series share one axis.
 */
export function comparisonPoints(
  all: ChartPoint[],
  visible: ChartPoint[],
  mode: CompareMode,
): ChartPoint[] {
  if (mode === "off" || visible.length === 0) return [];
  const start = visible[0].date.getTime();
  const end = visible.at(-1)!.date.getTime();
  const shift =
    mode === "previous"
      ? Math.max(end - start, DAY_MS)
      : 365 * DAY_MS;
  return all
    .filter((p) => {
      const t = p.date.getTime();
      return t >= start - shift && t <= end - shift;
    })
    .map((p) => ({ ...p, date: new Date(p.date.getTime() + shift) }));
}

/**
 * Lines up series with different timestamps on one index-based axis, null
 * where a series has no value at that slot.
 */
export function alignSeries(
  series: ChartPoint[][],
): { dates: Date[]; values: (number | null)[][] } {
  const times = [...new Set(series.flat().map((p) => p.date.getTime()))].sort(
    (a, b) => a - b,
  );
  const slot = new Map(times.map((t, i) => [t, i]));
  const values = series.map((points) => {
    const row: (number | null)[] = times.map(() => null);
    points.forEach((p) => (row[slot.get(p.date.getTime())!] = p.value));
    return row;
  });
  return { dates: times.map((t) => new Date(t)), values };
}

export interface ChartStats {
  min: number;
  max: number;
  average: number;
  change: number;
}

export function chartStats(points: ChartPoint[]): ChartStats | null {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: values.reduce((a, b) => a + b, 0) / values.length,
    change: values.at(-1)! - values[0],
  };
}

const MAX_GOAL_DAYS = 5 * 365;

function linearFit(
  points: ChartPoint[],
): { slope: number; at: (time: number) => number } | null {
  if (points.length < 2) return null;
  const t0 = points[0].date.getTime();
  const xs = points.map((p) => (p.date.getTime() - t0) / DAY_MS);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  if (den === 0 || num === 0) return null;
  const slope = num / den;
  return { slope, at: (time) => my + slope * ((time - t0) / DAY_MS - mx) };
}

/** When a least-squares line through the points reaches the goal, or null if it never does. */
export function goalEta(points: ChartPoint[], goal: number): Date | null {
  const fit = linearFit(points);
  if (!fit) return null;
  const last = points.at(-1)!.date.getTime();
  const daysLeft = (goal - fit.at(last)) / fit.slope;
  if (daysLeft <= 0 || daysLeft > MAX_GOAL_DAYS) return null;
  return new Date(last + daysLeft * DAY_MS);
}

const projectionStepDays = (days: number) => {
  if (days <= 14) return 1;
  if (days <= 91) return 7;
  if (days <= 365) return 14;
  return 30;
};

/** Expected values on the fitted line from today (or the last entry, if later) to the goal date. */
export function projectionPoints(
  points: ChartPoint[],
  goal: number,
  now: Date = new Date(),
): ChartPoint[] {
  const fit = linearFit(points);
  const eta = goalEta(points, goal);
  if (!fit || !eta) return [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = Math.max(today.getTime(), points.at(-1)!.date.getTime());
  if (from >= eta.getTime()) return [];
  const step = projectionStepDays((eta.getTime() - from) / DAY_MS) * DAY_MS;
  const result: ChartPoint[] = [];
  for (let t = from; eta.getTime() - t > step / 2; t += step) {
    result.push({ date: new Date(t), value: fit.at(t) });
  }
  result.push({ date: eta, value: goal });
  return result;
}

export function goalMessage(
  eta: Date | null,
  goal: number,
  fmt: (v: number) => string,
): string {
  return eta
    ? `At this rate you reach ${fmt(goal)} around ${formatDate(eta)}.`
    : `Not moving toward ${fmt(goal)} in this range.`;
}

const niceStep = (rough: number): number => {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough)!;
  return step * magnitude;
};

export interface YBounds {
  min: number;
  max: number;
  step: number;
  sections: number;
}

/** Rounded axis bounds. A manual range is ignored unless both ends are set and max exceeds min. */
export function yBounds(
  values: number[],
  settings: Pick<ChartSettings, "yAxis" | "yMin" | "yMax">,
  targetSections = 4,
): YBounds {
  if (
    settings.yAxis === "manual" &&
    settings.yMin != null &&
    settings.yMax != null &&
    settings.yMax > settings.yMin
  ) {
    const step = (settings.yMax - settings.yMin) / targetSections;
    return { min: settings.yMin, max: settings.yMax, step, sections: targetSections };
  }
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (settings.yAxis === "zero") lo = Math.min(0, lo);
  if (hi === lo) {
    hi += 1;
    lo = settings.yAxis === "zero" ? lo : lo - 1;
  }
  const step = niceStep((hi - lo) / targetSections);
  const min = Math.floor(lo / step) * step;
  const sections = Math.max(1, Math.ceil((hi - min) / step));
  return { min, max: min + step * sections, step, sections };
}

export function decimalsFor(values: number[]): number {
  if (values.length === 0) return 0;
  return values.every((v) => Math.abs(v) >= 10) &&
    Math.max(...values) - Math.min(...values) >= 10
    ? 0
    : 1;
}

/** Evenly spaced date labels, blank between them, with the year once the span passes one. */
export function xLabels(dates: Date[], maxLabels: number): string[] {
  if (dates.length === 0) return [];
  const spanDays = (dates.at(-1)!.getTime() - dates[0].getTime()) / DAY_MS;
  const options: Intl.DateTimeFormatOptions =
    spanDays > 365
      ? { month: "short", year: "2-digit" }
      : { month: "short", day: "numeric" };
  const every = Math.max(1, Math.ceil(dates.length / Math.max(1, maxLabels)));
  return dates.map((d, i) => (i % every === 0 ? formatDate(d, options) : ""));
}

/** Every chart point is an SVG node, so render cost would otherwise grow with history. Keeps the peak and the latest. */
export function downsample<T extends { value: number }>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / (max - 2));
  let peak = 0;
  points.forEach((point, index) => {
    if (point.value > points[peak].value) peak = index;
  });
  return points.filter(
    (_, index) =>
      index % step === 0 || index === peak || index === points.length - 1,
  );
}

export function toCsv(points: ChartPoint[], valueHeader: string): string {
  const header = `date,${valueHeader.replaceAll(/[",\n]/g, " ")}`;
  return [header, ...points.map((p) => `${toDateString(p.date)},${p.value}`)].join("\n");
}

export interface ChartModel {
  visible: ChartPoint[];
  dates: Date[];
  main: (number | null)[];
  trend: (number | null)[] | null;
  compare: (number | null)[] | null;
  /** True when `main` holds expected values from projectionPoints rather than logged ones. */
  projected: boolean;
  eta: Date | null;
  /** Slot index to the visible point drawn there. */
  pointAt: (ChartPoint | undefined)[];
  records: Set<number>;
  bounds: YBounds;
}

/**
 * Everything a chart draws, on one shared index axis. A goal projection replaces
 * the logged points, and while it does the trend, comparison and records are off.
 */
export function chartModel(
  points: ChartPoint[],
  settings: ChartSettings,
  { maxPoints, now = new Date() }: { maxPoints?: number; now?: Date } = {},
): ChartModel {
  const inRange = filterRange(points, settings, now);
  const eta = settings.goal == null ? null : goalEta(inRange, settings.goal);
  const projection =
    settings.projection && settings.kind !== "bar" && settings.goal != null
      ? projectionPoints(inRange, settings.goal, now)
      : [];
  const projected = projection.length > 0;
  let visible = projected ? projection : inRange;
  if (maxPoints) visible = downsample(visible, maxPoints);
  const trendPoints =
    !projected && settings.trend !== "off" && visible.length > 1
      ? trendValues(visible, settings.trend).map((value, i) => ({
          date: visible[i].date,
          value,
        }))
      : [];
  const comparePoints =
    projected || settings.kind === "bar"
      ? []
      : comparisonPoints(points, visible, settings.compare);
  const { dates, values } = alignSeries([visible, trendPoints, comparePoints]);
  const byTime = new Map(visible.map((p) => [p.date.getTime(), p]));
  const recordTimes = settings.showPRs && !projected
    ? new Set([...recordIndices(visible)].map((i) => visible[i].date.getTime()))
    : new Set<number>();
  const plotted = values.flat().filter((v): v is number => v != null);
  if (settings.goal != null) plotted.push(settings.goal);
  return {
    visible,
    dates,
    main: values[0],
    trend: trendPoints.length ? values[1] : null,
    compare: comparePoints.length ? values[2] : null,
    projected,
    eta,
    pointAt: dates.map((d) => byTime.get(d.getTime())),
    records: new Set(
      dates.flatMap((d, i) => (recordTimes.has(d.getTime()) ? [i] : [])),
    ),
    bounds: yBounds(plotted, settings),
  };
}
