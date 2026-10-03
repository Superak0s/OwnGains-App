import type { ExerciseWithSets, WorkoutData, WorkoutDay } from "@shared/types";
import { getExercises } from "@utils/exerciseDb";
import { musclesOf } from "./muscleFrequency";

export interface TargetRange {
  min: number;
  max: number;
}

export const DEFAULT_TARGET_RANGE: TargetRange = { min: 10, max: 20 };

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEETS = {
  program: "Main Program",
  primary: "Muscle Points (Primary Only)",
  combined: "Muscle Pts (Primary+Secondary)",
  db: "Exercise DB",
} as const;

const MUSCLES = [
  "Chest",
  "Middle Back",
  "Lats",
  "Traps",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Abdominals",
  "Glutes",
  "Quadriceps",
  "Hamstrings",
  "Adductors",
  "Abductors",
  "Calves",
  "Lower Back",
  "Neck",
];

const DAY_TOTAL_LABEL = "Day Total Sets:";
const NOT_FOUND = "Not found in db";
const PROGRAM_HEADER_ROW = 4;
const PROGRAM_FIRST_ROW = 5;
const TARGET_MIN_ROW = 3;
const TARGET_MAX_ROW = 4;
const MUSCLE_HEADER_ROW = 6;
const MUSCLE_FIRST_ROW = 7;

const STYLE = {
  plain: 0,
  title: 1,
  note: 2,
  header: 3,
  text: 4,
  number: 5,
  totalLabel: 6,
  totalNumber: 7,
  input: 8,
  inputLabel: 9,
  dbHeader: 10,
} as const;
type Style = (typeof STYLE)[keyof typeof STYLE];

// Bands scale off each muscle's own target, reproducing the original sheet's
// fixed <5 / 5-8 / 8-10 / 10-20 / 20-23 / 23-27 / >27 cut-offs at 10-20.
const BANDS: { color: string; when: (v: string, lo: string, hi: string) => string }[] = [
  { color: "FFC00000", when: (v, lo) => `${v}<${lo}*0.5` },
  { color: "FFFF6B6B", when: (v, lo) => `AND(${v}>=${lo}*0.5,${v}<${lo}*0.8)` },
  { color: "FFFFC7CE", when: (v, lo) => `AND(${v}>=${lo}*0.8,${v}<${lo})` },
  { color: "FFC6EFCE", when: (v, lo, hi) => `AND(${v}>=${lo},${v}<=${hi})` },
  { color: "FFFFE699", when: (v, _lo, hi) => `AND(${v}>${hi},${v}<=${hi}*1.15)` },
  { color: "FFFFB84D", when: (v, _lo, hi) => `AND(${v}>${hi}*1.15,${v}<=${hi}*1.35)` },
  { color: "FFC55A11", when: (v, _lo, hi) => `${v}>${hi}*1.35` },
];

interface Cell {
  value?: string | number;
  formula?: string;
  style: Style;
}

type Grid = Map<number, Map<number, Cell>>;

interface SheetSpec {
  name: string;
  grid: Grid;
  widths: number[];
  rowHeights?: Record<number, number>;
  merges?: string[];
  frozenRows?: number;
  extraXml?: string;
}

interface ProgramRow {
  day: string;
  name: string;
  sets: Record<string, number>;
  reps: string;
  exercise: ExerciseWithSets;
}

interface DbEntry {
  name: string;
  primary: string;
  secondary: string;
}

export const columnName = (index: number): string => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
};

const ref = (col: number, row: number) => `${columnName(col)}${row}`;
const absCol = (col: number) => `$${columnName(col)}`;

const put = (grid: Grid, row: number, col: number, cell: Cell) => {
  let cells = grid.get(row);
  if (!cells) {
    cells = new Map();
    grid.set(row, cells);
  }
  cells.set(col, cell);
};

// XML 1.0 forbids most control characters outright, even escaped.
const escapeXml = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex -- stripping them is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

const titleCase = (text: string) =>
  text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const bracketed = (muscles: string[]) => `[${muscles.join(", ")}]`;

const displaySplit = (split: string) => split.replace(/\s+sets$/i, "").trim() || split;

const splitsOf = (program: WorkoutData): string[] => {
  const names = new Set(program.split ?? []);
  for (const day of program.days) {
    Object.keys(day.split ?? {}).forEach((name) => names.add(name));
    day.exercises?.forEach((e) =>
      Object.keys(e.setsBySplit ?? {}).forEach((name) => names.add(name)),
    );
  }
  return [...names];
};

// The per-split lists lose an exercise's order relative to other splits, so
// they are only read when the combined list is missing. A repeated name is a
// separate row (two blocks of rows on one day), matched by occurrence.
const exercisesOfDay = (day: WorkoutDay, splits: string[]): ExerciseWithSets[] => {
  if (day.exercises?.length) return day.exercises;
  const rows: ExerciseWithSets[] = [];
  for (const split of splits) {
    const seen = new Map<string, number>();
    for (const exercise of day.split?.[split]?.exercises ?? []) {
      const occurrence = seen.get(exercise.name) ?? 0;
      seen.set(exercise.name, occurrence + 1);
      const existing = rows.filter((r) => r.name === exercise.name)[occurrence];
      if (existing) {
        existing.setsBySplit[split] = exercise.sets;
        continue;
      }
      rows.push({
        name: exercise.name,
        exerciseId: exercise.exerciseId,
        primaryMuscles: exercise.primaryMuscles ?? [],
        secondaryMuscles: exercise.secondaryMuscles ?? [],
        setsBySplit: { [split]: exercise.sets },
        ...(exercise.reps !== undefined && { reps: exercise.reps }),
      });
    }
  }
  return rows;
};

const dayLabel = (day: WorkoutDay, index: number): string => {
  const title = day.dayTitle?.trim() ?? "";
  if (/^day\s*\d+/i.test(title)) return title;
  const number = day.dayNumber || index + 1;
  return title ? `Day ${number} - ${title}` : `Day ${number}`;
};

const programDays = (program: WorkoutData, splits: string[]): ProgramRow[][] => {
  const days: ProgramRow[][] = [];
  let previousLabel = "";
  program.days.forEach((day, index) => {
    const exercises = exercisesOfDay(day, splits).filter((e) => e.name?.trim());
    if (exercises.length === 0) return;
    // The importer starts a new day whenever the label changes, so two
    // neighbouring days sharing a title would come back as one.
    let label = dayLabel(day, index);
    if (label === previousLabel) label = `Day ${index + 1} - ${label}`;
    previousLabel = label;
    days.push(
      exercises.map((exercise) => ({
        day: label,
        name: exercise.name.trim(),
        sets: Object.fromEntries(
          splits.map((split) => [split, Number(exercise.setsBySplit?.[split] ?? 0) || 0]),
        ),
        reps: String(exercise.reps ?? "").trim(),
        exercise,
      })),
    );
  });
  return days;
};

const entryFor = (exercise: ExerciseWithSets): Omit<DbEntry, "name"> => {
  const { primary, secondary } = musclesOf(exercise);
  const fallback = (exercise.primaryMuscles ?? []).map((m) => m.trim()).filter(Boolean);
  return {
    primary: bracketed(primary.length ? primary.map(titleCase) : fallback),
    secondary: bracketed(secondary.map(titleCase)),
  };
};

// MATCH is case-insensitive and takes the first hit, so the program's own
// exercises go first and later names that differ only in case are dropped.
const exerciseDb = (days: ProgramRow[][]): DbEntry[] => {
  const entries = new Map<string, DbEntry>();
  for (const row of days.flat()) {
    const key = row.name.toLowerCase();
    if (!entries.has(key)) entries.set(key, { name: row.name, ...entryFor(row.exercise) });
  }
  for (const exercise of getExercises()) {
    const key = exercise.name.toLowerCase();
    if (entries.has(key)) continue;
    entries.set(key, {
      name: exercise.name,
      primary: bracketed(exercise.primaryMuscles.map(titleCase)),
      secondary: bracketed(exercise.secondaryMuscles.map(titleCase)),
    });
  }
  return [...entries.values()];
};

interface ProgramLayout {
  grid: Grid;
  lastCol: number;
  lastRow: number;
  setsCol: (splitIndex: number) => number;
  exerciseRanges: string[];
  rows: { primary: string; secondary: string; sets: number[] }[];
}

const buildProgramGrid = (
  days: ProgramRow[][],
  splits: string[],
  db: Map<string, DbEntry>,
  dbLastRow: number,
): ProgramLayout => {
  const grid: Grid = new Map();
  const setsCol = (i: number) => 4 + i;
  const repsCol = setsCol(splits.length);
  const lastCol = repsCol;
  const dbSheet = quoteSheet(SHEETS.db);
  const lookup = (col: string, row: number) =>
    `IFERROR(INDEX(${dbSheet}!$${col}$2:$${col}$${dbLastRow},MATCH($B${row},${dbSheet}!$A$2:$A$${dbLastRow},0)),"${NOT_FOUND}")`;

  const splitTitle = splits.map(displaySplit).join(" / ");
  put(grid, 1, 0, {
    value: splitTitle ? `Training Program (${splitTitle})` : "Training Program",
    style: STYLE.title,
  });
  put(grid, 2, 0, {
    value:
      `Exported from OwnGains on ${new Date().toISOString().slice(0, 10)}. ` +
      "Primary/Secondary Muscles auto-populate from the Exercise DB sheet based on the Exercise name. " +
      "Change the exercise (use the dropdown) and muscles update automatically. " +
      "Weekly set targets are set on the Muscle Points sheets: change the default Target Min / Target Max there, " +
      "or type over one muscle's own target.",
    style: STYLE.note,
  });

  ["Day", "Exercise", "Primary Muscles", "Secondary Muscles", ...splits, "Reps"].forEach(
    (header, col) => put(grid, PROGRAM_HEADER_ROW, col, { value: header, style: STYLE.header }),
  );

  const rows: ProgramLayout["rows"] = [];
  const exerciseRanges: string[] = [];
  let row = PROGRAM_FIRST_ROW;
  for (const day of days) {
    const firstRow = row;
    for (const exercise of day) {
      const entry = db.get(exercise.name.toLowerCase());
      const primary = entry?.primary ?? NOT_FOUND;
      const secondary = entry?.secondary ?? NOT_FOUND;
      put(grid, row, 0, { value: exercise.day, style: STYLE.text });
      put(grid, row, 1, { value: exercise.name, style: STYLE.text });
      put(grid, row, 2, { formula: lookup("B", row), value: primary, style: STYLE.text });
      put(grid, row, 3, { formula: lookup("C", row), value: secondary, style: STYLE.text });
      splits.forEach((split, i) => {
        const sets = exercise.sets[split];
        put(grid, row, setsCol(i), { value: sets > 0 ? sets : undefined, style: STYLE.number });
      });
      put(grid, row, repsCol, { value: exercise.reps || undefined, style: STYLE.number });
      rows.push({ primary, secondary, sets: splits.map((s) => exercise.sets[s]) });
      row++;
    }
    exerciseRanges.push(`B${firstRow}:B${row - 1}`);

    put(grid, row, 1, { value: DAY_TOTAL_LABEL, style: STYLE.totalLabel });
    [2, 3, repsCol].forEach((col) => put(grid, row, col, { style: STYLE.totalLabel }));
    splits.forEach((split, i) => {
      const col = columnName(setsCol(i));
      put(grid, row, setsCol(i), {
        formula: `SUM(${col}${firstRow}:${col}${row - 1})`,
        value: day.reduce((sum, e) => sum + e.sets[split], 0),
        style: STYLE.totalNumber,
      });
    });
    row += 2;
  }

  const lastDataRow = Math.max(PROGRAM_FIRST_ROW, row - 2);
  put(grid, row, 1, { value: "WEEKLY TOTAL SETS:", style: STYLE.totalLabel });
  [2, 3, repsCol].forEach((col) => put(grid, row, col, { style: STYLE.totalLabel }));
  splits.forEach((split, i) => {
    const col = columnName(setsCol(i));
    put(grid, row, setsCol(i), {
      formula: `SUMIF($B$${PROGRAM_FIRST_ROW}:$B$${lastDataRow},"${DAY_TOTAL_LABEL}",${col}$${PROGRAM_FIRST_ROW}:${col}$${lastDataRow})`,
      value: days.flat().reduce((sum, e) => sum + e.sets[split], 0),
      style: STYLE.totalNumber,
    });
  });

  return { grid, lastCol, lastRow: lastDataRow, setsCol, exerciseRanges, rows };
};

const statusText = (points: number, range: TargetRange) =>
  points < range.min
    ? "Below range"
    : points > range.max
      ? "Above range"
      : `Within ${range.min}-${range.max}`;

const buildMuscleSheet = (
  name: string,
  withSecondary: boolean,
  splits: string[],
  program: ProgramLayout,
  range: TargetRange,
): SheetSpec => {
  const grid: Grid = new Map();
  const pointsCol = (i: number) => 1 + i;
  const minCol = pointsCol(splits.length);
  const maxCol = minCol + 1;
  const statusCol = (i: number) => maxCol + 1 + i;
  const lastMuscleRow = MUSCLE_FIRST_ROW + MUSCLES.length - 1;
  const main = quoteSheet(SHEETS.program);
  const span = (col: string) =>
    `${main}!$${col}$${PROGRAM_FIRST_ROW}:$${col}$${program.lastRow}`;

  put(grid, 1, 0, {
    value: withSecondary
      ? "Weekly Muscle Points - Primary (1 pt) + Secondary (0.5 pt) per Set"
      : "Weekly Muscle Points - Primary Muscle Only (1 point per set)",
    style: STYLE.title,
  });
  put(grid, 2, 0, {
    value:
      "Target: points per muscle per week. Change the default Target Min / Target Max below to re-grade every muscle, " +
      "or type over a muscle's own Target Min / Target Max to give it a different target.",
    style: STYLE.note,
  });
  put(grid, TARGET_MIN_ROW, 0, { value: "Default Target Min", style: STYLE.inputLabel });
  put(grid, TARGET_MIN_ROW, 1, { value: range.min, style: STYLE.input });
  put(grid, TARGET_MAX_ROW, 0, { value: "Default Target Max", style: STYLE.inputLabel });
  put(grid, TARGET_MAX_ROW, 1, { value: range.max, style: STYLE.input });

  [
    "Muscle",
    ...splits.map((s) => `${displaySplit(s)} Points`),
    "Target Min",
    "Target Max",
    ...splits.map((s) => `${displaySplit(s)} Status`),
  ].forEach((header, col) =>
    put(grid, MUSCLE_HEADER_ROW, col, { value: header, style: STYLE.header }),
  );

  MUSCLES.forEach((muscle, m) => {
    const row = MUSCLE_FIRST_ROW + m;
    const needle = muscle.toLowerCase();
    const lo = `${absCol(minCol)}${row}`;
    const hi = `${absCol(maxCol)}${row}`;
    put(grid, row, 0, { value: muscle, style: STYLE.text });
    put(grid, row, minCol, { formula: `$B$${TARGET_MIN_ROW}`, value: range.min, style: STYLE.number });
    put(grid, row, maxCol, { formula: `$B$${TARGET_MAX_ROW}`, value: range.max, style: STYLE.number });

    splits.forEach((_split, i) => {
      const sets = columnName(program.setsCol(i));
      const hits = (col: string) =>
        `SUMPRODUCT(ISNUMBER(SEARCH($A${row},${span(col)}))*${span(sets)})`;
      const score = program.rows.reduce(
        (sum, r) =>
          sum +
          (r.primary.toLowerCase().includes(needle) ? r.sets[i] : 0) +
          (withSecondary && r.secondary.toLowerCase().includes(needle) ? r.sets[i] * 0.5 : 0),
        0,
      );
      const points = ref(pointsCol(i), row);
      put(grid, row, pointsCol(i), {
        formula: withSecondary ? `${hits("C")}+0.5*${hits("D")}` : hits("C"),
        value: score,
        style: STYLE.number,
      });
      put(grid, row, statusCol(i), {
        formula: `IF(AND(${points}>=${lo},${points}<=${hi}),"Within "&${lo}&"-"&${hi},IF(${points}<${lo},"Below range","Above range"))`,
        value: statusText(score, range),
        style: STYLE.text,
      });
    });
  });

  put(grid, lastMuscleRow + 2, 0, {
    value: withSecondary
      ? "Note: secondary muscles add 0.5 pt per set whenever the muscle appears in an exercise's Secondary Muscles on the Main Program sheet."
      : "Note: points count any exercise whose Primary Muscles on the Main Program sheet contain that muscle, so the table remains accurate as you swap exercises.",
    style: STYLE.note,
  });

  let priority = 1;
  const conditional = splits
    .map((_split, i) => {
      const value = `${absCol(pointsCol(i))}${MUSCLE_FIRST_ROW}`;
      const lo = `${absCol(minCol)}${MUSCLE_FIRST_ROW}`;
      const hi = `${absCol(maxCol)}${MUSCLE_FIRST_ROW}`;
      const sqref = [pointsCol(i), statusCol(i)]
        .map((col) => `${ref(col, MUSCLE_FIRST_ROW)}:${ref(col, lastMuscleRow)}`)
        .join(" ");
      const rules = BANDS.map(
        (band, dxfId) =>
          `<cfRule type="expression" dxfId="${dxfId}" priority="${priority++}"><formula>${escapeXml(band.when(value, lo, hi))}</formula></cfRule>`,
      ).join("");
      return `<conditionalFormatting sqref="${sqref}">${rules}</conditionalFormatting>`;
    })
    .join("");

  return {
    name,
    grid,
    widths: [20, ...splits.map(() => 12), 12, 12, ...splits.map(() => 16)],
    rowHeights: { 2: 30 },
    merges: [`A2:${ref(statusCol(splits.length - 1), 2)}`],
    frozenRows: MUSCLE_HEADER_ROW,
    extraXml: conditional,
  };
};

const cellXml = (reference: string, cell: Cell): string => {
  const { value, formula, style } = cell;
  const s = style === STYLE.plain ? "" : ` s="${style}"`;
  if (formula !== undefined) {
    const f = `<f>${escapeXml(formula)}</f>`;
    if (typeof value === "number") return `<c r="${reference}"${s}>${f}<v>${value}</v></c>`;
    return `<c r="${reference}"${s} t="str">${f}<v>${escapeXml(value ?? "")}</v></c>`;
  }
  if (typeof value === "number") return `<c r="${reference}"${s}><v>${value}</v></c>`;
  if (value === undefined || value === "") return `<c r="${reference}"${s}/>`;
  return `<c r="${reference}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};

const sheetXml = (sheet: SheetSpec): string => {
  const rowNumbers = [...sheet.grid.keys()].sort((a, b) => a - b);
  const rows = rowNumbers
    .map((row) => {
      const cells = sheet.grid.get(row) ?? new Map<number, Cell>();
      const height = sheet.rowHeights?.[row];
      const ht = height ? ` ht="${height}" customHeight="1"` : "";
      const xml = [...cells.keys()]
        .sort((a, b) => a - b)
        .map((col) => cellXml(ref(col, row), cells.get(col) as Cell))
        .join("");
      return `<row r="${row}"${ht}>${xml}</row>`;
    })
    .join("");
  const pane = sheet.frozenRows
    ? `<pane ySplit="${sheet.frozenRows}" topLeftCell="A${sheet.frozenRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  const cols = sheet.widths
    .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    merges +
    (sheet.extraXml ?? "") +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    "</worksheet>"
  );
};

const solidFill = (rgb: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor rgb="${rgb}"/></patternFill></fill>`;

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="6">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
  '<font><sz val="9"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><sz val="10"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  "</fonts>" +
  '<fills count="5">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  solidFill("FF1F4E78") +
  solidFill("FFFCE4D6") +
  solidFill("FFFFF2CC") +
  "</fills>" +
  '<borders count="2">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="11">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  `<dxfs count="${BANDS.length}">${BANDS.map((b) => `<dxf>${solidFill(b.color)}</dxf>`).join("")}</dxfs>` +
  "</styleSheet>";

/** Every part of the .xlsx package, keyed by its path inside the zip. */
export function buildProgramWorkbookFiles(
  program: WorkoutData,
  range: TargetRange = DEFAULT_TARGET_RANGE,
): Record<string, string> {
  const splits = splitsOf(program);
  if (splits.length === 0) splits.push("Sets");
  const days = programDays(program, splits);
  const dbEntries = exerciseDb(days);
  const dbLastRow = dbEntries.length + 1;
  const layout = buildProgramGrid(
    days,
    splits,
    new Map(dbEntries.map((e) => [e.name.toLowerCase(), e])),
    dbLastRow,
  );

  const validation = layout.exerciseRanges.length
    ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${layout.exerciseRanges.join(" ")}"><formula1>${escapeXml(`${quoteSheet(SHEETS.db)}!$A$2:$A$${dbLastRow}`)}</formula1></dataValidation></dataValidations>`
    : "";

  const dbGrid: Grid = new Map();
  ["Exercise Name", "Primary Muscles", "Secondary Muscles"].forEach((header, col) =>
    put(dbGrid, 1, col, { value: header, style: STYLE.dbHeader }),
  );
  dbEntries.forEach((entry, i) => {
    put(dbGrid, i + 2, 0, { value: entry.name, style: STYLE.plain });
    put(dbGrid, i + 2, 1, { value: entry.primary, style: STYLE.plain });
    put(dbGrid, i + 2, 2, { value: entry.secondary, style: STYLE.plain });
  });

  const sheets: SheetSpec[] = [
    {
      name: SHEETS.program,
      grid: layout.grid,
      widths: [30, 38, 26, 30, ...splits.map(() => 11), 10],
      rowHeights: { 1: 18, 2: 45 },
      merges: [`A1:${ref(layout.lastCol, 1)}`, `A2:${ref(layout.lastCol, 2)}`],
      frozenRows: PROGRAM_HEADER_ROW,
      extraXml: validation,
    },
    buildMuscleSheet(SHEETS.primary, false, splits, layout, range),
    buildMuscleSheet(SHEETS.combined, true, splits, layout, range),
    { name: SHEETS.db, grid: dbGrid, widths: [42, 30, 40], frozenRows: 1 },
  ];

  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_s, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets
        .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("") +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_s, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>",
    "xl/styles.xml": STYLES_XML,
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet);
  });
  return files;
}

interface ZipWriter {
  utils: {
    cfb_new: (options: { root: string }) => unknown;
    cfb_add: (zip: unknown, path: string, content: Uint8Array) => void;
  };
  write: (zip: unknown, options: { fileType: "zip"; type: "base64"; compression: boolean }) => string;
}

// SheetJS community edition cannot write fills, conditional formatting or
// dropdowns, so the package is assembled by hand and only zipped by its CFB.
export function buildProgramXlsxBase64(
  program: WorkoutData,
  range: TargetRange = DEFAULT_TARGET_RANGE,
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- xlsx is ~1 MB; load it only when exporting
  const { CFB } = require("xlsx") as { CFB: ZipWriter };
  const zip = CFB.utils.cfb_new({ root: "R" });
  const encoder = new TextEncoder();
  for (const [path, xml] of Object.entries(buildProgramWorkbookFiles(program, range))) {
    CFB.utils.cfb_add(zip, `/${path}`, encoder.encode(xml));
  }
  return CFB.write(zip, { fileType: "zip", type: "base64", compression: true });
}
