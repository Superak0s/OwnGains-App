import XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import type { WorkoutData } from "@shared/types";
import { parseWorkoutFileClient } from "@utils/clientWorkoutParser";
import {
  buildProgramWorkbookFiles,
  buildProgramXlsxBase64,
  columnName,
} from "../programSpreadsheet";

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

const BENCH = "Barbell_Bench_Press_-_Medium_Grip";

const program: WorkoutData = {
  split: ["GF", "BF"],
  days: [
    {
      dayNumber: 1,
      dayTitle: "Day 1 - Upper A",
      split: {},
      exercises: [
        {
          name: "Bench",
          exerciseId: BENCH,
          primaryMuscles: ["Chest"],
          secondaryMuscles: [],
          setsBySplit: { GF: 3, BF: 4 },
          reps: "8-10",
        },
        {
          name: "Lat Pulldown Thing",
          primaryMuscles: ["Lats"],
          secondaryMuscles: [],
          setsBySplit: { GF: 2, BF: 0 },
        },
      ],
    },
    {
      dayNumber: 2,
      dayTitle: "Lower",
      split: {
        BF: {
          totalSets: 5,
          exercises: [{ name: "Hip Thrust Custom", primaryMuscles: ["Glutes"], sets: 5 }],
        },
      },
    },
  ],
};

const read = (range = { min: 10, max: 20 }) =>
  XLSX.read(buildProgramXlsxBase64(program, range), { type: "base64" });

const cell = (wb: XLSX.WorkBook, sheet: string, ref: string) =>
  wb.Sheets[sheet][ref] as XLSX.CellObject | undefined;

describe("columnName", () => {
  it("rolls over past Z", () => {
    expect([0, 25, 26, 51, 52].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });
});

describe("buildProgramXlsxBase64", () => {
  it("lays the program out one exercise per row with a sets column per split", () => {
    const wb = read();
    expect(wb.SheetNames).toEqual([
      "Main Program",
      "Muscle Points (Primary Only)",
      "Muscle Pts (Primary+Secondary)",
      "Exercise DB",
    ]);
    const main = "Main Program";
    expect(["A4", "B4", "C4", "D4", "E4", "F4", "G4"].map((r) => cell(wb, main, r)?.v)).toEqual([
      "Day", "Exercise", "Primary Muscles", "Secondary Muscles", "GF", "BF", "Reps",
    ]);
    expect(cell(wb, main, "A5")?.v).toBe("Day 1 - Upper A");
    expect(cell(wb, main, "C5")?.v).toBe("[Chest]");
    expect(cell(wb, main, "C5")?.f).toContain("'Exercise DB'!");
    expect(cell(wb, main, "G5")?.v).toBe("8-10");
    // A split that does not train an exercise is left blank, as in the source sheet.
    expect(cell(wb, main, "F6")?.v).toBeUndefined();
    expect(cell(wb, main, "B7")?.v).toBe("Day Total Sets:");
    expect(cell(wb, main, "E7")).toMatchObject({ v: 5, f: "SUM(E5:E6)" });
    expect(cell(wb, main, "A9")?.v).toBe("Day 2 - Lower");
    expect(cell(wb, main, "C9")?.v).toBe("[Glutes]");
    expect(cell(wb, main, "F12")?.v).toBe(9);
  });

  it("grades muscles against the chosen range through editable target cells", () => {
    const wb = read({ min: 2, max: 4 });
    const sheet = "Muscle Points (Primary Only)";
    expect(cell(wb, sheet, "B3")?.v).toBe(2);
    expect(cell(wb, sheet, "B4")?.v).toBe(4);
    const chest = 7;
    expect(cell(wb, sheet, `A${chest}`)?.v).toBe("Chest");
    expect(cell(wb, sheet, `B${chest}`)?.v).toBe(3);
    expect(cell(wb, sheet, `C${chest}`)?.v).toBe(4);
    expect(cell(wb, sheet, `D${chest}`)).toMatchObject({ v: 2, f: "$B$3" });
    expect(cell(wb, sheet, `E${chest}`)).toMatchObject({ v: 4, f: "$B$4" });
    expect(cell(wb, sheet, `F${chest}`)?.v).toBe("Within 2-4");
    expect(cell(wb, sheet, `F${chest}`)?.f).toContain("$D7");
    const glutes = 16;
    expect(cell(wb, sheet, `A${glutes}`)?.v).toBe("Glutes");
    expect(cell(wb, sheet, `G${glutes}`)?.v).toBe("Above range");
  });

  it("counts secondary muscles as half a set on the combined sheet", () => {
    const wb = read();
    const sheet = "Muscle Pts (Primary+Secondary)";
    const triceps = 13;
    expect(cell(wb, sheet, `A${triceps}`)?.v).toBe("Triceps");
    expect(cell(wb, sheet, `B${triceps}`)?.v).toBe(1.5);
  });

  it("keys the colour bands to each muscle's target cells rather than fixed numbers", () => {
    const xml = buildProgramWorkbookFiles(program)["xl/worksheets/sheet2.xml"];
    expect(xml).toContain('sqref="B7:B23 F7:F23"');
    expect(xml).toContain("<formula>AND($B7&gt;=$D7,$B7&lt;=$E7)</formula>");
    expect(xml).not.toMatch(/<formula>[^<]*\b(10|20)\b/);
  });

  it("imports back into the same program", async () => {
    const base64 = buildProgramXlsxBase64(program);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 1024 });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    const parsed = await parseWorkoutFileClient("file:///program.xlsx");

    expect(parsed.split).toEqual(["GF", "BF"]);
    expect(parsed.days.map((d) => d.dayTitle)).toEqual(["Day 1 - Upper A", "Day 2 - Lower"]);
    expect(parsed.days[0].exercises).toEqual([
      expect.objectContaining({
        name: "Bench",
        primaryMuscles: ["Chest"],
        secondaryMuscles: ["Shoulders", "Triceps"],
        setsBySplit: { GF: 3, BF: 4 },
        reps: "8-10",
      }),
      expect.objectContaining({ name: "Lat Pulldown Thing", setsBySplit: { GF: 2 } }),
    ]);
    expect(parsed.days[1].split.BF.totalSets).toBe(5);
  });
});
