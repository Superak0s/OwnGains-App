import {
  kgToDisplay,
  displayToKg,
  getEmptyStateInfo,
  getDayOverviewTint,
  getDayOverviewTextColor,
  computeProgressPercentage,
  getAddingSetsSubtitle,
  checkIsSelectedSetAssisted,
  getLocalHistoryEntries,
  getServerHistoryEntries,
  pickBestPerformanceSummary,
  getPartnerStatusText,
  editMachineMeta,
  resolveExerciseMuscles,
  exercisesForMuscle,
} from "../utils";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { isDarkColor } from "@utils/color";

const colors = {
  background: "#ffffff",
  surface: "#ffffff",
  textPrimary: "#111111",
  textSecondary: "#aaa",
  success: "#0f0",
  accent: "#00f",
} as unknown as ThemeColors;

const darkColors = { ...colors, background: "#16161e" } as ThemeColors;

describe("weight unit conversion", () => {
  it("renders whole kg without decimals and fractional kg with one", () => {
    expect(kgToDisplay(100, "kg")).toBe("100");
    expect(kgToDisplay(100.25, "kg")).toBe("100.3");
  });

  it("converts kg to lbs for display", () => {
    expect(kgToDisplay(100, "lbs")).toBe("220.5");
  });

  it("parses display input back to kg", () => {
    expect(displayToKg("100", "kg")).toBe(100);
    expect(displayToKg("220.46", "lbs")).toBeCloseTo(100, 2);
  });

  it("treats blank, non-numeric and non-positive input as zero", () => {
    expect(displayToKg("", "kg")).toBe(0);
    expect(displayToKg("abc", "kg")).toBe(0);
    expect(displayToKg("-5", "kg")).toBe(0);
    expect(displayToKg("0", "lbs")).toBe(0);
  });
});

describe("getEmptyStateInfo", () => {
  it("asks for a plan first", () => {
    expect(getEmptyStateInfo(null, "A", {}, 1)?.title).toBe("No Workout Plan");
  });

  it("asks for a split once a plan exists", () => {
    expect(getEmptyStateInfo({}, null, {}, 1)?.title).toBe("No Split Selected");
  });

  it("names the split and day when the day is empty", () => {
    const info = getEmptyStateInfo({}, "Push", null, 3);
    expect(info?.title).toBe("No Workout for This Day");
    expect(info?.text).toBe("Push has no exercises scheduled for Day 3");
  });

  it("returns null when everything is present", () => {
    expect(getEmptyStateInfo({}, "A", {}, 1)).toBeNull();
  });

  it("names the trainee and offers no navigation when acting as one", () => {
    const info = getEmptyStateInfo(null, null, null, 1, "sam");
    expect(info?.text).toBe("sam hasn't set up a workout program yet.");
    expect(info?.actionTab).toBeUndefined();
    expect(getEmptyStateInfo({}, null, {}, 1, "sam")?.actionTab).toBeUndefined();
    expect(getEmptyStateInfo({}, "A", {}, 1, "sam")).toBeNull();
  });
});

describe("day overview tint", () => {
  it("greys out a locked day regardless of completion", () => {
    expect(getDayOverviewTint(colors, true, true)).toBe(colors.textSecondary);
  });

  it("turns green only when unlocked and complete", () => {
    expect(getDayOverviewTint(colors, false, true)).toBe(colors.success);
    expect(getDayOverviewTint(colors, false, false)).toBe(colors.accent);
  });

  it("darkens the fill on dark themes so the group does not glare", () => {
    const tint = getDayOverviewTint(darkColors, false, false);
    expect(tint).not.toBe(darkColors.accent);
    expect(isDarkColor(tint)).toBe(true);
  });

  it("pairs the fill with a legible foreground per theme", () => {
    expect(getDayOverviewTextColor(colors)).toBe(colors.surface);
    expect(getDayOverviewTextColor(darkColors)).toBe(darkColors.textPrimary);
  });
});

describe("computeProgressPercentage", () => {
  it("returns 0 rather than NaN when there are no sets", () => {
    expect(computeProgressPercentage(0, 0)).toBe(0);
  });

  it("scales completed sets to a percentage", () => {
    expect(computeProgressPercentage(3, 4)).toBe(75);
  });
});

describe("getAddingSetsSubtitle", () => {
  it("is undefined when not adding sets", () => {
    expect(getAddingSetsSubtitle(null)).toBeUndefined();
  });

  it("names the exercise being extended", () => {
    expect(getAddingSetsSubtitle({ exercise: { name: "Squat" } })).toBe(
      "Adding sets to: Squat",
    );
  });
});

describe("checkIsSelectedSetAssisted", () => {
  const dayWorkout = {
    exercises: [{ name: "Assisted Pull Up" }, { name: "Bench Press" }] as any,
  };

  it("is false without a selection or a day", () => {
    expect(checkIsSelectedSetAssisted(null, dayWorkout)).toBe(false);
    expect(
      checkIsSelectedSetAssisted({ exerciseIndex: 0, setIndex: 0 }, null),
    ).toBe(false);
  });

  it("is false when the index points past the exercise list", () => {
    expect(
      checkIsSelectedSetAssisted({ exerciseIndex: 9, setIndex: 0 }, dayWorkout),
    ).toBe(false);
  });

  it("detects 'assisted' case-insensitively", () => {
    expect(
      checkIsSelectedSetAssisted({ exerciseIndex: 0, setIndex: 0 }, dayWorkout),
    ).toBe(true);
    expect(
      checkIsSelectedSetAssisted({ exerciseIndex: 1, setIndex: 0 }, dayWorkout),
    ).toBe(false);
  });
});

describe("getLocalHistoryEntries", () => {
  const workoutData = {
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [{ name: "bench press" }, { name: "Squat" }],
          },
        },
      },
    ],
  };

  it("collects only the sets of the matching exercise, matched canonically", () => {
    const entries = getLocalHistoryEntries(
      {
        "1": {
          0: {
            "0": { weight: 100, reps: 5, completedAt: "2024-01-01T10:00:00Z" },
            "1": { weight: 100, reps: 1, completedAt: "2024-01-01T10:05:00Z" },
          },
          1: {
            "0": { weight: 140, reps: 5, completedAt: "2024-01-01T10:10:00Z" },
          },
        },
      },
      workoutData,
      "A",
      "Bench Press",
      ["Bench Press", "Squat"],
    );

    expect(entries).toHaveLength(2);
    expect(entries[0].oneRepMax).toBeCloseTo(100 * (1 + 5 / 30));
    expect(entries[1].oneRepMax).toBe(100);
    expect(entries[0].note).toBe("");
    expect(entries[0].isWarmup).toBe(false);
  });

  it("returns nothing when the day, split or exercises are missing", () => {
    expect(
      getLocalHistoryEntries({ "9": {} }, workoutData, "A", "Bench Press", []),
    ).toEqual([]);
    expect(
      getLocalHistoryEntries({ "1": {} }, workoutData, null, "Bench Press", []),
    ).toEqual([]);
  });

  it("keeps only the selected machine's sets, and pools them when asked", () => {
    const completed = {
      "1": {
        0: {
          "0": {
            weight: 100,
            reps: 5,
            completedAt: "2024-01-01T10:00:00Z",
            machineName: "Machine A",
          },
          "1": {
            weight: 80,
            reps: 5,
            completedAt: "2024-01-01T10:05:00Z",
            machineName: "Smith",
          },
        },
      },
    };
    const perVariant = getLocalHistoryEntries(
      completed,
      workoutData,
      "A",
      "Bench Press",
      ["Bench Press", "Squat"],
      "Machine A",
    );
    expect(perVariant.map((e) => e.weight)).toEqual([100]);

    const pooled = getLocalHistoryEntries(
      completed,
      workoutData,
      "A",
      "Bench Press",
      ["Bench Press", "Squat"],
      null,
    );
    expect(pooled.map((e) => e.weight).sort((a, b) => a - b)).toEqual([
      80, 100,
    ]);
  });

  it("keeps sets recorded before machines existed", () => {
    const entries = getLocalHistoryEntries(
      {
        "1": {
          0: {
            "0": { weight: 100, reps: 5, completedAt: "2024-01-01T10:00:00Z" },
          },
        },
      },
      workoutData,
      "A",
      "Bench Press",
      ["Bench Press", "Squat"],
      "Machine A",
    );
    expect(entries).toHaveLength(1);
  });

  it("coerces non-finite weights and reps to zero", () => {
    const entries = getLocalHistoryEntries(
      {
        "1": {
          0: {
            "0": {
              weight: Number.NaN,
              reps: undefined,
              completedAt: "2024-01-01T10:00:00Z",
            },
          },
        },
      },
      workoutData,
      "A",
      "bench press",
      [],
    );
    expect(entries[0]).toMatchObject({ weight: 0, reps: 0, oneRepMax: 0 });
  });
});

describe("getServerHistoryEntries", () => {
  it("flattens matching set timings across sessions", async () => {
    const fetchSessionHistory = jest.fn().mockResolvedValue([
      {
        startTime: "2024-01-01T09:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        setTimings: [
          {
            exerciseName: "Bench Press",
            weight: 100,
            reps: 5,
            endTime: "2024-01-01T10:00:00Z",
          },
          { exerciseName: "Squat", weight: 140, reps: 5 },
        ],
      },
      { setTimings: null },
    ]);

    const entries = await getServerHistoryEntries(
      fetchSessionHistory,
      "Bench Press",
      "Bench Press",
      [],
    );

    expect(fetchSessionHistory).toHaveBeenCalledWith(50, true);
    expect(entries).toHaveLength(1);
    expect(entries![0].weight).toBe(100);
  });

  it("falls back to the passed exercise name when a timing has none", async () => {
    const entries = await getServerHistoryEntries(
      jest.fn().mockResolvedValue([
        {
          startTime: "2024-01-01T09:00:00Z",
          setTimings: [{ weight: 60, reps: 8 }],
        },
      ]),
      "Bench Press",
      "Bench Press",
      [],
    );
    expect(entries).toHaveLength(1);
  });

  it("adds record sets from sessions older than the window", async () => {
    const recent = {
      id: 2,
      startTime: "2024-06-01T09:00:00Z",
      setTimings: [{ exerciseName: "Bench Press", weight: 100, reps: 5 }],
    };
    const old = {
      id: 1,
      startTime: "2022-01-01T09:00:00Z",
      setTimings: [{ exerciseName: "Bench Press", weight: 140, reps: 5 }],
    };

    const entries = await getServerHistoryEntries(
      jest.fn().mockResolvedValue([recent]),
      "Bench Press",
      "Bench Press",
      [],
      null,
      jest.fn().mockResolvedValue([recent, old]),
    );

    expect(entries!.map((e) => e.weight).sort()).toEqual([100, 140]);
  });

  it("returns empty on no sessions and null on a fetch failure", async () => {
    expect(
      await getServerHistoryEntries(
        jest.fn().mockResolvedValue([]),
        "x",
        "x",
        [],
      ),
    ).toEqual([]);

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await getServerHistoryEntries(
        jest.fn().mockRejectedValue(new Error("offline")),
        "x",
        "x",
        [],
      ),
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("pickBestPerformanceSummary", () => {
  const entry = (date: string, oneRepMax: number, isWarmup = false) =>
    ({
      date: new Date(date),
      weight: 0,
      reps: 0,
      oneRepMax,
      note: "",
      isWarmup,
    }) as any;

  it("ignores today's sets and warmups", () => {
    expect(
      pickBestPerformanceSummary([entry(new Date().toISOString(), 100)]),
    ).toBeNull();
    expect(
      pickBestPerformanceSummary([entry("2020-01-01", 100, true)]),
    ).toBeNull();
  });

  it("returns the most recent set and the heaviest estimated 1RM", () => {
    const result = pickBestPerformanceSummary([
      entry("2020-01-01", 120),
      entry("2020-03-01", 90),
      entry("2020-02-01", 100),
    ]);
    expect(result?.last.oneRepMax).toBe(90);
    expect(result?.best.oneRepMax).toBe(120);
    expect(result?.totalAttempts).toBe(3);
  });
});

describe("getPartnerStatusText", () => {
  it("prefers the ready flag", () => {
    expect(getPartnerStatusText(true, null)).toBe("✅ Ready for next set");
  });

  it("waits when no progress has arrived", () => {
    expect(getPartnerStatusText(false, null)).toBe("Waiting…");
  });

  it("shows the exercise name and 1-based set number", () => {
    expect(
      getPartnerStatusText(false, {
        exerciseName: "Squat",
        setIndex: 2,
      } as any),
    ).toBe("Squat · Set 3");
  });

  it("falls back to the exercise index, then to a dash", () => {
    expect(getPartnerStatusText(false, { exerciseIndex: 1 } as any)).toBe(
      "Ex 2 · —",
    );
    expect(getPartnerStatusText(false, {} as any)).toBe("— · —");
  });
});

describe("editMachineMeta", () => {
  const meta = { "Machine A": { note: "seat 3", pin: 5 } };

  it("carries the note and pin to a renamed machine", () => {
    expect(editMachineMeta(meta, "Machine A", "Hammer", { pin: 5 })).toEqual({
      Hammer: { pin: 5 },
    });
  });

  it("drops the entry when nothing is set", () => {
    expect(editMachineMeta(meta, "Machine A", "Machine A", {})).toEqual({});
  });

  it("leaves other machines alone", () => {
    const both = { ...meta, Smith: { pin: 2 } };
    expect(
      editMachineMeta(both, "Machine A", "Machine A", { note: "x" }),
    ).toEqual({ "Machine A": { note: "x" }, Smith: { pin: 2 } });
  });
});

describe("resolveExerciseMuscles", () => {
  const plan = [
    { name: "Bench Press", sets: 3, primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps"] },
    { name: "Mystery Move", sets: 3 },
  ];

  it("prefers the plan's own muscles, case-insensitively", () => {
    expect(resolveExerciseMuscles(" bench press ", plan)).toEqual({
      primary: ["Chest"],
      secondary: ["Triceps"],
    });
  });

  it("falls back to a confident database match, title-cased", () => {
    const result = resolveExerciseMuscles("Barbell Curl", []);
    expect(result?.primary).toEqual(["Biceps"]);
    expect(result?.primary.every((m) => /^[A-Z]/.test(m))).toBe(true);
  });

  it("returns null for blank or unknown names", () => {
    expect(resolveExerciseMuscles("  ", plan)).toBeNull();
    expect(resolveExerciseMuscles("Zzqx Flarp", plan)).toBeNull();
  });
});

describe("exercisesForMuscle", () => {
  const plan = [
    { name: "Cable Fly", sets: 3, primaryMuscles: ["Chest"] },
    { name: "Barbell Curl", sets: 3, primaryMuscles: ["Biceps"] },
  ];

  it("lists plan exercises first, then database ones, without duplicates", () => {
    const result = exercisesForMuscle("chest", plan);
    expect(result[0]).toEqual({ name: "Cable Fly", meta: "In your plan" });
    expect(result.length).toBeGreaterThan(10);
    const keys = result.map((r) => r.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("barbell curl");
  });

  it("leaves out stretches", () => {
    const names = exercisesForMuscle("hamstrings", []).map((r) => r.name);
    expect(names).not.toContain("90/90 Hamstring");
  });
});
