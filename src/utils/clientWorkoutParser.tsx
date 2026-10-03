// Block-format parsing logic is kept in sync with utils/workoutParser.ts and
// src/models/workout/parser.ts. Only the file read differs, because RN has no
// `fs` and no XLSX.readFile(path).
//
// The block format's header row is assumed to be the row immediately after a
// "Day" row, with no lookahead for spacer rows, the same assumption as the two
// server-side files, so fix all three together if it ever needs to change.
// The wide format (one header row, day repeated per exercise row) is
// client-only and has no server-side counterpart to keep in sync.

import { captureException, metric } from "@shared/services/crashReporting";
import * as FileSystem from "expo-file-system/legacy";
import type { SplitWorkout, WorkoutData, WorkoutDay } from "@shared/types";

const MAX_TOTAL_COLUMNS = 52;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_NAME_LENGTH = 50;

interface SplitColumn {
  index: number;
  name: string;
}

export interface SplitColumnCandidate {
  index: number;
  name: string;
  autoSelected: boolean;
}

type WorkingDay = WorkoutDay & {
  splitColumns?: SplitColumn[];
  repsColumn?: number | null;
};

// A purely numeric header ("10", "3.5") is a set count that ended up in a split
// slot, never a split name.
function isNumericLike(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

// Sheet cells come back typed as `unknown` (could be a string, number,
// boolean, Date, or in malformed sheets even an object/array). Anything that
// is not a primitive becomes an empty cell rather than "[object Object]".
function cellToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

function cellToNumber(value: unknown): number | null {
  if (value === "" || value === undefined) return null;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(cellToString(value));
  return Number.isNaN(parsed) ? null : parsed;
}

// Split-column headers (GF, BF, ...) must be contiguous from the first split
// column: stopping at the first blank keeps unrelated content further right
// in the same row (e.g. a personal summary table) from being read as extra
// splits. "Reps" also stops the scan since the wide format puts it right
// after the split columns with no blank in between.
function scanContiguousSplitColumns(
  headers: unknown[],
  colLimit: number,
  startColumn = 2,
): SplitColumn[] {
  const columns: SplitColumn[] = [];
  for (let j = startColumn; j < colLimit; j++) {
    const header = cellToString(headers[j]).trim();
    if (!header) break;
    if (header.length > MAX_NAME_LENGTH) break;
    if (isNumericLike(header)) break;
    if (header.toLowerCase() === "reps") break;
    columns.push({ index: j, name: header });
  }
  return columns;
}

function findHeaderIndex(headers: unknown[], name: string): number | null {
  const idx = headers.findIndex(
    (h) => cellToString(h).trim().toLowerCase() === name,
  );
  return idx === -1 ? null : idx;
}

// "8-12", "10" or a blank cell, kept as text so ranges are preserved in the round trip.
function cellToReps(value: unknown): string | undefined {
  const text = cellToString(value).trim();
  return text || undefined;
}

// One cell contains a bracketed muscle list, e.g. "[Shoulders, Triceps]" or "[]".
function splitBracketedMuscleCell(value: unknown): string[] {
  const text = cellToString(value).trim().replace(/^\[/, "").replace(/\]$/, "");
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The wide format has one header row, shared by every day, with a literal
// "Day"/"Exercise" pair of column headers, a signature the block format
// never produces (its day marker cell reads "Day 1 - ...", not "Day").
function findWideFormatHeaderRow(data: unknown[][]): number | null {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (
      cellToString(row[0]).trim().toLowerCase() === "day" &&
      cellToString(row[1]).trim().toLowerCase() === "exercise"
    ) {
      return i;
    }
  }
  return null;
}

async function readSheetRows(fileUri: string): Promise<unknown[][]> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error("File not found");
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new Error("File too large (max 5 MB)");
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Inline require, not a static import: xlsx is ~1 MB and costs ~50 ms of
  // top-level evaluation, which every app launch paid for via PlanScreen even
  // though only a spreadsheet import needs it. `await import` would be the usual
  // pattern here, but jest-expo does not transpile it to CJS.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load
  const XLSX = require("xlsx") as typeof import("xlsx");
  const workbook = XLSX.read(base64, {
    type: "base64",
    sheetRows: MAX_ROWS,
    cellFormula: false,
    cellHTML: false,
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error("This file has no readable sheets.");
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
}

function findBlockFormatHeaderRow(
  data: unknown[][],
): { headers: unknown[]; colLimit: number } | null {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCell = cellToString(row[0]).trim();
    if (firstCell.toLowerCase().startsWith("day ") && i + 1 < data.length) {
      const headers = data[i + 1];
      return { headers, colLimit: Math.min(headers.length, MAX_TOTAL_COLUMNS) };
    }
  }
  return null;
}

// Wide-format split columns start right after "Exercise"/"Primary
// Muscles"/"Secondary Muscles", whichever of those is rightmost.
function wideFormatStartColumn(headers: unknown[]): number {
  const exerciseCol = findHeaderIndex(headers, "exercise") ?? 1;
  const primaryCol = findHeaderIndex(headers, "primary muscles") ?? -1;
  const secondaryCol = findHeaderIndex(headers, "secondary muscles") ?? -1;
  return Math.max(exerciseCol, primaryCol, secondaryCol) + 1;
}

function extractWideFormatCandidates(
  headers: unknown[],
): SplitColumnCandidate[] {
  const colLimit = Math.min(headers.length, MAX_TOTAL_COLUMNS);
  const startColumn = wideFormatStartColumn(headers);

  const autoColumns = scanContiguousSplitColumns(headers, colLimit, startColumn);
  const autoIndices = new Set(autoColumns.map((c) => c.index));

  const candidates: SplitColumnCandidate[] = [];
  for (let j = startColumn; j < colLimit; j++) {
    const header = cellToString(headers[j]).trim();
    if (!header) continue;
    if (header.length > MAX_NAME_LENGTH) continue;
    if (header.toLowerCase() === "reps") continue;
    candidates.push({
      index: j,
      name: header,
      autoSelected: autoIndices.has(j),
    });
  }
  return candidates;
}

/**
 * Every non-blank cell from the first split column of the first day's header
 * row, with no contiguity cutoff, so the user picks which columns are really
 * splits instead of the app guessing. `autoSelected` seeds the picker's
 * checkboxes with what the contiguous scan would have chosen.
 */
export async function extractSplitColumnCandidates(
  fileUri: string,
): Promise<SplitColumnCandidate[]> {
  const data = await readSheetRows(fileUri);

  const wideHeaderRow = findWideFormatHeaderRow(data);
  if (wideHeaderRow !== null) {
    return extractWideFormatCandidates(data[wideHeaderRow]);
  }

  const found = findBlockFormatHeaderRow(data);
  if (!found) return [];
  const { headers, colLimit } = found;

  const autoColumns = scanContiguousSplitColumns(headers, colLimit);
  const autoIndices = new Set(autoColumns.map((c) => c.index));

  const candidates: SplitColumnCandidate[] = [];
  for (let j = 2; j < colLimit; j++) {
    const header = cellToString(headers[j]).trim();
    if (!header) continue;
    if (header.length > MAX_NAME_LENGTH) continue;
    candidates.push({
      index: j,
      name: header,
      autoSelected: autoIndices.has(j),
    });
  }
  return candidates;
}

// The user's explicit picks are taken as-is, with no contiguity requirement.
// Callers that skip the picker fall back to the contiguous scan.
function buildSplitColumnsForDay(
  headers: unknown[],
  colLimit: number,
  selectedColumnIndices: number[] | undefined,
): SplitColumn[] {
  if (!selectedColumnIndices) {
    return scanContiguousSplitColumns(headers, colLimit);
  }
  return selectedColumnIndices
    .filter((j) => j >= 2 && j < colLimit)
    .map((j) => ({ index: j, name: cellToString(headers[j]).trim() }))
    .filter((c) => c.name.length > 0);
}

function registerSplitColumns(
  day: WorkingDay,
  splitColumns: SplitColumn[],
  splits: string[],
): void {
  day.splitColumns = splitColumns;
  for (const { name } of splitColumns) {
    if (!splits.includes(name)) splits.push(name);
    day.split[name] ??= { exercises: [], totalSets: 0 };
  }
}

function startNewDay(
  firstCell: string,
  data: unknown[][],
  rowIndex: number,
  selectedColumnIndices: number[] | undefined,
  splits: string[],
): WorkingDay {
  const day: WorkingDay = {
    dayNumber: extractDayNumber(firstCell),
    dayTitle: firstCell,
    primaryMuscles: extractPrimaryGroups(firstCell),
    secondaryMuscles: [],
    exercises: [],
    split: {},
  };

  if (rowIndex + 1 < data.length) {
    const headers = data[rowIndex + 1];
    const colLimit = Math.min(headers.length, MAX_TOTAL_COLUMNS);
    const splitColumns = buildSplitColumnsForDay(
      headers,
      colLimit,
      selectedColumnIndices,
    );
    registerSplitColumns(day, splitColumns, splits);
    day.repsColumn = findHeaderIndex(headers, "reps");
  }

  return day;
}

function applyTotalSetsRow(day: WorkingDay, row: unknown[]): void {
  day.splitColumns?.forEach(({ index, name }) => {
    const total = cellToNumber(row[index]);
    if (total !== null) day.split[name].totalSets = total;
  });
}

// One cell often lists several groups ("Chest / Triceps"), and each is its own
// muscle to the rest of the app.
function splitMuscleCell(value: unknown): string[] {
  return cellToString(value)
    .split(/[/,&+]/)
    .map((group) => group.trim())
    .filter(Boolean);
}

function applyExerciseRow(
  day: WorkingDay,
  row: unknown[],
  firstCell: string,
): void {
  const primaryMuscles = splitMuscleCell(row[1]);
  const setsBySplit: Record<string, number> = {};
  const reps =
    day.repsColumn === null || day.repsColumn === undefined
      ? undefined
      : cellToReps(row[day.repsColumn]);

  day.splitColumns?.forEach(({ index, name }) => {
    const sets = cellToNumber(row[index]);
    if (sets === null) return;

    setsBySplit[name] = sets;
    if (sets > 0) {
      day.split[name].exercises.push({
        name: firstCell,
        primaryMuscles: [...primaryMuscles],
        secondaryMuscles: [],
        sets,
        ...(reps !== undefined && { reps }),
      });
    }
  });

  if (Object.keys(setsBySplit).length > 0) {
    day.exercises ??= [];
    day.exercises.push({
      name: firstCell,
      primaryMuscles: [...primaryMuscles],
      secondaryMuscles: [],
      setsBySplit,
      ...(reps !== undefined && { reps }),
    });
  }
}

export async function parseWorkoutFileClient(
  fileUri: string,
  selectedColumnIndices?: number[],
): Promise<WorkoutData> {
  try {
    const parsed = await parseWorkbook(fileUri, selectedColumnIndices);
    metric.count("import.parsed", 1, {
      attributes: {
        outcome: "ok",
        picked_columns: Boolean(selectedColumnIndices),
      },
    });
    metric.distribution("import.parsed.days", parsed.days.length);
    return parsed;
  } catch (error) {
    metric.count("import.parsed", 1, {
      attributes: {
        outcome: "failed",
        picked_columns: Boolean(selectedColumnIndices),
      },
    });
    captureException(error, { stage: "parseWorkoutFileClient" });
    throw error;
  }
}

async function parseWorkbook(
  fileUri: string,
  selectedColumnIndices?: number[],
): Promise<WorkoutData> {
  const data = await readSheetRows(fileUri);

  const wideHeaderRow = findWideFormatHeaderRow(data);
  if (wideHeaderRow !== null) {
    return parseWideFormat(data, wideHeaderRow, selectedColumnIndices);
  }
  return parseBlockFormat(data, selectedColumnIndices);
}

// The wide format repeats the day title on every exercise row instead of
// marking it once, so a day boundary is "title changed" rather than a
// dedicated marker row. A blank day cell is a spacer or a "Day/Weekly Total
// Sets:" row and is skipped rather than parsed as a data row.
function parseWideFormat(
  data: unknown[][],
  headerRowIndex: number,
  selectedColumnIndices: number[] | undefined,
): WorkoutData {
  const headers = data[headerRowIndex];
  const colLimit = Math.min(headers.length, MAX_TOTAL_COLUMNS);
  const exerciseCol = findHeaderIndex(headers, "exercise") ?? 1;
  const primaryCol = findHeaderIndex(headers, "primary muscles");
  const secondaryCol = findHeaderIndex(headers, "secondary muscles");
  const repsCol = findHeaderIndex(headers, "reps");
  const startColumn = wideFormatStartColumn(headers);

  const splitColumns = selectedColumnIndices
    ? selectedColumnIndices
        .filter((j) => j >= startColumn && j < colLimit)
        .map((j) => ({ index: j, name: cellToString(headers[j]).trim() }))
        .filter((c) => c.name.length > 0)
    : scanContiguousSplitColumns(headers, colLimit, startColumn);

  const splits: string[] = [];
  for (const { name } of splitColumns) {
    if (!splits.includes(name)) splits.push(name);
  }

  const days: WorkoutDay[] = [];
  let currentDay: WorkoutDay | null = null;

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    const dayTitle = cellToString(row[0]).trim();
    if (!dayTitle) continue;

    if (currentDay?.dayTitle !== dayTitle) {
      const split: Record<string, SplitWorkout> = {};
      for (const name of splits) split[name] = { exercises: [], totalSets: 0 };
      const newDay: WorkoutDay = {
        dayNumber: extractDayNumber(dayTitle),
        dayTitle,
        primaryMuscles: [],
        secondaryMuscles: [],
        exercises: [],
        split,
      };
      days.push(newDay);
      currentDay = newDay;
    }

    applyWideExerciseRow(currentDay, row, {
      exerciseCol,
      primaryCol,
      secondaryCol,
      repsCol,
      splitColumns,
    });
  }

  return { days, split: splits };
}

function applyWideExerciseRow(
  day: WorkoutDay,
  row: unknown[],
  columns: {
    exerciseCol: number;
    primaryCol: number | null;
    secondaryCol: number | null;
    repsCol: number | null;
    splitColumns: SplitColumn[];
  },
): void {
  const { exerciseCol, primaryCol, secondaryCol, repsCol, splitColumns } =
    columns;
  const exerciseName = cellToString(row[exerciseCol]).trim();
  if (!exerciseName) return;

  const primaryMuscles =
    primaryCol === null ? [] : splitBracketedMuscleCell(row[primaryCol]);
  const secondaryMuscles =
    secondaryCol === null ? [] : splitBracketedMuscleCell(row[secondaryCol]);
  const setsBySplit: Record<string, number> = {};
  const reps = repsCol === null ? undefined : cellToReps(row[repsCol]);

  splitColumns.forEach(({ index, name }) => {
    const sets = cellToNumber(row[index]);
    if (sets === null) return;

    setsBySplit[name] = sets;
    if (sets > 0) {
      day.split[name].exercises.push({
        name: exerciseName,
        primaryMuscles: [...primaryMuscles],
        secondaryMuscles: [...secondaryMuscles],
        sets,
        ...(reps !== undefined && { reps }),
      });
      day.split[name].totalSets += sets;
    }
  });

  if (Object.keys(setsBySplit).length > 0) {
    day.exercises ??= [];
    day.exercises.push({
      name: exerciseName,
      primaryMuscles: [...primaryMuscles],
      secondaryMuscles: [...secondaryMuscles],
      setsBySplit,
      ...(reps !== undefined && { reps }),
    });
  }
}

function parseBlockFormat(
  data: unknown[][],
  selectedColumnIndices?: number[],
): WorkoutData {
  const days: WorkingDay[] = [];
  const splits: string[] = [];
  let currentDay: WorkingDay | null = null;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCell = cellToString(row[0]).trim();

    if (firstCell.toLowerCase().startsWith("day ")) {
      if (currentDay) days.push(currentDay);
      currentDay = startNewDay(firstCell, data, i, selectedColumnIndices, splits);
      i++;
      continue;
    }

    if (!currentDay || !firstCell) continue;

    if (firstCell === "Total Sets:") {
      applyTotalSetsRow(currentDay, row);
      continue;
    }

    if (firstCell === "Exercise") continue;

    applyExerciseRow(currentDay, row, firstCell);
  }

  if (currentDay) days.push(currentDay);
  // `splitColumns` is per-parse scratch state, but the result is persisted and
  // uploaded verbatim, so it must be removed before the program is saved.
  return {
    days: days.map(({ splitColumns: _drop, repsColumn: _dropReps, ...day }) => day),
    split: splits,
  };
}

function extractDayNumber(dayTitle: string): number {
  const match = /Day (\d+)/i.exec(dayTitle);
  return match ? Number.parseInt(match[1]) : 0;
}

function extractPrimaryGroups(dayTitle: string): string[] {
  const parts = dayTitle.split("—");
  return parts.length > 1 ? parts[1].split("/").map((g) => g.trim()) : [];
}


