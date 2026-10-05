import { createRecordStore, nextLocalId } from "@shared/services/offlineHelpers";
import type {
  InjuryRecord,
  InjuryStatus,
  LogInjuryParams,
} from "../../types/muscleRecovery";
import type { ApiResponse } from "../types";

const STORAGE_KEY = "@off_injuries";

const store = createRecordStore<InjuryRecord>(
  "injuries",
  STORAGE_KEY,
  (e) => e.id,
  (e) => e.startDate,
);

export const injuryApi = {
  logInjury: async (params: LogInjuryParams): Promise<ApiResponse<InjuryRecord>> => {
    const now = new Date().toISOString();
    const record: InjuryRecord = {
      id: nextLocalId(),
      muscleGroup: params.muscleGroup,
      injuryType: params.injuryType,
      painLevel: params.painLevel,
      startDate: params.startDate,
      note: params.note || null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await store.put(record);
    return { success: true, data: record };
  },

  getAllInjuries: async (): Promise<ApiResponse<InjuryRecord[]>> => {
    const records = await store.getAll();
    return { success: true, data: records };
  },

  getInjuriesByMuscle: async (muscle: string): Promise<ApiResponse<InjuryRecord[]>> => {
    const data = await store.getWhere({ muscleGroup: muscle });
    return { success: true, data };
  },

  updateInjury: async (
    id: number,
    updates: { painLevel?: number; status?: InjuryStatus; recoveryDate?: string; note?: string },
  ): Promise<ApiResponse<InjuryRecord>> => {
    const entry = await store.getOne(id);
    if (!entry) throw new Error("Injury not found");
    const updated: InjuryRecord = {
      ...entry,
      ...(updates.painLevel !== undefined ? { painLevel: updates.painLevel } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.recoveryDate !== undefined ? { recoveryDate: updates.recoveryDate } : {}),
      ...(updates.note !== undefined ? { note: updates.note } : {}),
      updatedAt: new Date().toISOString(),
    };
    await store.put(updated);
    return { success: true, data: updated };
  },

  deleteInjury: async (id: number): Promise<ApiResponse<null>> => {
    await store.remove(id);
    return { success: true, data: null };
  },
};
