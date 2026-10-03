import type { RecoveryMuscleGroup } from "@shared/types"
export type { ApiResponse } from "@features/tracking/services/types"
export {
  RECOVERY_MUSCLE_GROUPS as MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "@shared/types"
export type { RecoveryMuscleGroup as MuscleGroup } from "@shared/types"

type MuscleGroup = RecoveryMuscleGroup


export interface SorenessFollowUp {
  id: number;
  sorenessId: number;
  // 0-10 current level
  intensity: number;
  status: "still_sore" | "better" | "recovered";
  note?: string | null;
  createdAt: string;
}

export interface SorenessEntry {
  id: number;
  muscleGroup: MuscleGroup;
  // 0-10, integer
  intensity: number;
  note?: string | null;
  // ISO date when first logged
  loggedAt: string;
  // ISO date when last updated
  updatedAt: string;
  // ISO date when marked recovered
  recoveredAt?: string | null;
  status: "active" | "recovering" | "recovered";
  followUps: SorenessFollowUp[];
  createdAt: string;
}

export type ActiveSoreness = SorenessEntry;


interface MuscleRecoveryStats {
  muscleGroup: MuscleGroup;
  totalEpisodes: number;
  averageRecoveryDays: number;
  maxRecoveryDays: number;
  averageSeverity: number;
  lastSorenessDate: string | null;
  isCurrentlySore: boolean;
}

export interface DOMSStats {
  totalActiveSoreness: number;
  totalRecoveryEpisodes: number;
  averageRecoveryDays: number;
  mostSoreMuscle: MuscleGroup | null;
  muscleRecoveryStats?: MuscleRecoveryStats[];
  severityTrend: { date: string; averageIntensity: number }[];
  // frequency count
  heatmapData: Record<MuscleGroup, number>;
}


export interface ProgressPhotoMuscle {
  id: string | number;
  takenAt?: string;
  uri?: string;
  thumbUri?: string;
  muscleGroups?: MuscleGroup[];
  note?: string | null;
  angle?: "front" | "back" | "side" | "custom";
  customSideName?: string;
  createdAt?: string;
}

/** Keyset position: the `takenAt` and `id` of the last photo already loaded. */
export interface PhotoCursor {
  before: string;
  beforeId: string;
}

export interface PhotoPage {
  success: boolean;
  data: ProgressPhotoMuscle[];
  nextCursor: PhotoCursor | null;
}


export type InjuryType =
  | "strain"
  | "sprain"
  | "tendonitis"
  | "fracture"
  | "dislocation"
  | "tear"
  | "overuse"
  | "surgery"
  | "other";

export type InjuryStatus = "active" | "recovering" | "recovered";

export interface InjuryRecord {
  id: number;
  muscleGroup: MuscleGroup;
  injuryType: InjuryType;
  // 0-10
  painLevel: number;
  // ISO date
  startDate: string;
  // ISO date when recovered
  recoveryDate?: string;
  note?: string | null;
  status: InjuryStatus;
  createdAt: string;
  updatedAt: string;
}



export interface PersonalMuscleNote {
  id: number;
  muscleGroup: MuscleGroup;
  content: string;
  createdAt: string;
  updatedAt: string;
}


export interface LogSorenessParams {
  muscleGroup: MuscleGroup;
  intensity: number;
  note?: string;
  loggedAt?: string;
}

export interface UpdateSorenessParams {
  sorenessId: number;
  intensity: number;
  status: "still_sore" | "better" | "recovered";
  note?: string;
}

export interface LogInjuryParams {
  muscleGroup: MuscleGroup;
  injuryType: InjuryType;
  painLevel: number;
  startDate: string;
  note?: string;
}

export interface LogProgressPhotoParams {
  uri: string;
  muscleGroups: MuscleGroup[];
  note?: string;
  angle?: "front" | "back" | "side" | "custom";
  customSideName?: string;
  takenAt?: string;
}
