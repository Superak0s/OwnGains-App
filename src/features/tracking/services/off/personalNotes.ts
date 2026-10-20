import type {
  PersonalMuscleNote,
  MuscleGroup,
} from "../../types/muscleRecovery";
import type { ApiResponse } from "../types";
import { createRecordStore, nextId } from "@shared/services/offlineHelpers";


export function createPersonalNotesApi(user?: string) {
  const store = createRecordStore<PersonalMuscleNote>(
    "personal_muscle_notes",
    (n) => n.id,
    (n) => n.createdAt,
    user,
  );

  const personalNotesApi = {
    createNote: async (params: {
      muscleGroup: MuscleGroup;
      content: string;
    }): Promise<ApiResponse<PersonalMuscleNote>> => {
      const now = new Date().toISOString();
      const note: PersonalMuscleNote = {
        id: await nextId("personal_notes_counter"),
        muscleGroup: params.muscleGroup,
        content: params.content,
        createdAt: now,
        updatedAt: now,
      };
      await store.put(note);
      return { success: true, data: note };
    },

    getNotesByMuscle: async (
      muscleGroup: MuscleGroup,
    ): Promise<ApiResponse<PersonalMuscleNote[]>> => {
      const data = await store.getWhere({ muscleGroup });
      return { success: true, data };
    },

    deleteNote: async (id: number): Promise<ApiResponse<null>> => {
      await store.remove(id);
      return { success: true, data: null };
    },
  };
  return { personalNotesApi };
}

export const { personalNotesApi } = createPersonalNotesApi();
