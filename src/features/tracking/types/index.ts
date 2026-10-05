import type { ProgressPhoto, MacrosEntry, BodyFatEntry, WeightEntry } from "@shared/types";
import type { HydrationEntry, MeasurementEntry, MenstrualEntry } from "../services/types";
import type { SorenessEntry } from "./muscleRecovery";

export type WeightUnit = "kg" | "lbs";
export type Gender = "male" | "female";

export interface BodyFatMeasurements {
  waist: number;
  neck: number;
  hip?: number | null;
  unit?: string;
}

export interface LogMacrosParams {
  name?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
  errorMargin?: number;
  time?: string;
  date?: string | null;
  note?: string | null;
}

export interface MacrosGoals {
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  calories?: number | null;
}

export interface SavedMacroFood {
  id: string;
  name: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
  errorMargin?: number;
}

export type TrackingEntry =
  | WeightEntry
  | MacrosEntryWithFields
  | ProgressPhoto
  | BodyFatEntryWithFields
  | HydrationEntry
  | MeasurementEntry
  | MenstrualEntry
  | SorenessEntry;

export interface DayModalState {
  date: Date;
  tab: string;
  existingEntries: TrackingEntry[] | null;
  isToday: boolean;
}

export interface MacrosEntryWithFields extends MacrosEntry {
  date?: string;
  errorMargin?: number;
  time?: string;
}

export interface BodyFatEntryWithFields extends BodyFatEntry {
  percentage?: number;
  measurements?: {
    waist?: number;
    neck?: number;
    hip?: number;
  } | null;
}


export interface MenstrualSettings {
  periodDays: number;
  cycleLengthDays: number;
  updatedAt?: string | null;
}


export interface CustomMeasurementType {
  id: number;
  keyName: string;
  label: string;
  unit?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomMeasurementValue {
  id: number;
  keyName: string;
  value: number;
  measuredAt: string;
  note?: string | null;
}

export type { MuscleGroup } from "./muscleRecovery";

