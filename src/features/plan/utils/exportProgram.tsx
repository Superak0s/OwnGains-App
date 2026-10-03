import { writeBinaryExport, writeJsonExport } from "@utils/writeJsonExport";
import type { ExportResult } from "@utils/writeJsonExport";
import type { WorkoutData } from "@shared/types";
import {
  buildProgramXlsxBase64,
  XLSX_MIME_TYPE,
  type TargetRange,
} from "./programSpreadsheet";

interface ExportedProgram {
  exportedAt: string;
  selectedSplit: string | null;
  program: WorkoutData;
}

export async function exportProgramData(
  workoutData: WorkoutData | null,
  selectedSplit: string | null,
): Promise<ExportResult | null> {
  if (!workoutData) return null;

  const payload: ExportedProgram = {
    exportedAt: new Date().toISOString(),
    selectedSplit,
    program: workoutData,
  };

  return writeJsonExport("workout-program", payload);
}

export async function exportProgramSpreadsheet(
  workoutData: WorkoutData | null,
  targetRange: TargetRange,
): Promise<ExportResult | null> {
  if (!workoutData) return null;
  return writeBinaryExport(
    "workout-program",
    "xlsx",
    buildProgramXlsxBase64(workoutData, targetRange),
    XLSX_MIME_TYPE,
  );
}
