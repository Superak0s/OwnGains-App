import {
  ApiError,
  fetchIdempotent,
  parseApiResponse,
} from "@shared/services/apiClient";
import type { HttpFetch } from "@shared/services/authenticatedFetch";
import type {
  SetTiming,
  WorkoutSession,
  FullSessionWithGroups,
  WorkoutData,
} from "@shared/types";
import {
  demoDays,
  type DemoFillResult,
} from "@features/settings/utils/demoData";

export interface SessionHistoryPage {
  sessions: WorkoutSession[];
  nextCursor: string | null;
}

export interface WorkoutAnalytics {
  totalSessions: number;
  totalSetsCompleted: number;
}

export interface UpdateSetParams {
  exerciseName?: string;
  primaryMuscles?: string[] | null;
  secondaryMuscles?: string[] | null;
  weight?: number;
  reps?: number;
  startTime?: string;
  endTime?: string;
  note?: string;
  isWarmup?: boolean;
  rir?: number | null;
}

export interface RecordSetParams {
  exerciseName: string;
  setIndex: number;
  startTime: string;
  endTime: string;
  weight: number;
  reps: number;
  note?: string;
  isWarmup?: boolean;
  /** Reps in reserve, 0-9. Omitted when the user didn't rate the set. */
  rir?: number;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  /** Machine the set was performed on, when the exercise has machines. */
  machineName?: string;
}

export interface RenameExerciseResult {
  updatedCount: number;
}

// The server's weight column is DECIMAL, which mysql2 serializes as a string
// (e.g. "62.50") rather than a number. Normalize it here so every caller
// gets the real number the SetTiming type promises.
const normalizeTiming = (timing: SetTiming): SetTiming => ({
  ...timing,
  weight: timing.weight == null ? timing.weight : Number(timing.weight),
});

const normalizeSession = <T extends { setTimings?: SetTiming[] }>(
  session: T,
): T =>
  session.setTimings
    ? { ...session, setTimings: session.setTimings.map(normalizeTiming) }
    : session;

function required<T>(value: T | undefined, message: string, status: number): T {
  if (!value) throw new ApiError(message, status);
  return value;
}

export const makeWorkoutApi = (http: HttpFetch) => {
  // The key lets the server recognise a replay whose first attempt it already
  // committed before the response was lost.
  const sendJson = (
    path: string,
    method: string,
    body: unknown,
    idempotencyKey?: string,
  ) => {
    const init = {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    };
    return idempotencyKey
      ? fetchIdempotent(http, path, init, idempotencyKey)
      : http(path, init);
  };

  return {
    pickWorkoutFile: async (): Promise<string | null> => {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.oasis.opendocument.spreadsheet",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/octet-stream",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return null;
      return result.assets?.[0]?.uri ?? null;
    },

    startSession: async (
      split: string | null,
      dayNumber: number,
      dayTitle?: string,
      // A workout's muscle labels are read through its program day server-side,
      // and the offline twin stores them itself. serviceModeContract.test.ts
      // requires the on/ and off/ signatures to match, so the params are unused here.
      _primaryMuscles?: string[],
      _secondaryMuscles?: string[],
      isDemo: boolean = false,
      startTime: string | null = null,
      idempotencyKey?: string,
    ): Promise<number | string> => {
      // Sent, not dropped: DELETE /api/sessions/demo has no other way to tell
      // generated sessions from real ones, so an untagged demo fill mixes
      // fabricated data into real history, analytics, streaks and PRs permanently.
      const res = await sendJson(
        "/api/sessions/start",
        "POST",
        { split, dayNumber, dayTitle, startTime, ...(isDemo && { isDemo: true }) },
        idempotencyKey,
      );
      const data = await parseApiResponse<{
        session?: { id?: number | string };
      }>(res);
      return required(
        data.session?.id,
        "startSession succeeded but response had no session.id",
        res.status,
      );
    },

    updateSessionDay: async (
      sessionId: number | string,
      dayNumber: number,
      dayTitle?: string,
      idempotencyKey?: string,
    ): Promise<void> => {
      const res = await sendJson(
        `/api/sessions/${sessionId}`,
        "PATCH",
        { dayNumber, dayTitle: dayTitle ?? null },
        idempotencyKey,
      );
      await parseApiResponse(res);
    },

    recordSet: async (
      sessionId: number | string,
      params: RecordSetParams,
      idempotencyKey?: string,
    ): Promise<SetTiming> => {
      const {
        note = "",
        isWarmup = false,
        primaryMuscles = [],
        secondaryMuscles = [],
        ...rest
      } = params;
      const res = await sendJson(
        `/api/sessions/${sessionId}/set`,
        "POST",
        { ...rest, note, isWarmup, primaryMuscles, secondaryMuscles },
        idempotencyKey,
      );
      const data = await parseApiResponse<{ timing?: SetTiming }>(res);
      return normalizeTiming(
        required(
          data.timing,
          "recordSet succeeded but response had no timing",
          res.status,
        ),
      );
    },

    updateSet: async (
      sessionId: number | string,
      setId: number | string,
      updates: UpdateSetParams,
    ): Promise<SetTiming> => {
      const res = await sendJson(
        `/api/sessions/${sessionId}/sets/${setId}`,
        "PATCH",
        updates,
      );
      const data = await parseApiResponse<{ timing?: SetTiming }>(res);
      return normalizeTiming(
        required(
          data.timing,
          "updateSet succeeded but response had no timing",
          res.status,
        ),
      );
    },

    deleteSet: async (
      sessionId: number | string,
      exerciseName: string,
      setIndex: number,
    ): Promise<{ deletedCount: number }> => {
      const params = new URLSearchParams({
        exerciseName,
        setIndex: String(setIndex),
      });
      const res = await http(
        `/api/sessions/${sessionId}/sets?${params.toString()}`,
        { method: "DELETE" },
      );
      return parseApiResponse(res);
    },

    renameExercise: async (
      split: string,
      oldName: string,
      updates: {
        newName?: string;
        primaryMuscles?: string[] | null;
        secondaryMuscles?: string[] | null;
      },
    ): Promise<RenameExerciseResult> => {
      const res = await sendJson("/api/sessions/rename-exercise", "POST", {
        split,
        oldName,
        ...updates,
      });
      return parseApiResponse(res);
    },

    endSession: async (
      sessionId: number | string,
      endTime: string | null = null,
      idempotencyKey?: string,
    ): Promise<WorkoutSession> => {
      const res = await sendJson(
        `/api/sessions/${sessionId}/end`,
        "POST",
        { endTime },
        idempotencyKey,
      );
      const data = await parseApiResponse<{ session?: WorkoutSession }>(res);
      return required(
        data.session,
        "endSession succeeded but response had no session",
        res.status,
      );
    },

    getAnalytics: async (
      split: string | null = null,
      dayNumber: number | null = null,
      days: number = 365,
    ): Promise<WorkoutAnalytics> => {
      const params = new URLSearchParams();
      if (split) params.set("split", split);
      if (dayNumber) params.set("dayNumber", String(dayNumber));
      // How far back the server should look. Without it the server scans the
      // user's entire history on every dashboard open. Pass a bigger number
      // (36500 = all time) when the user asks for a wider window.
      params.set("days", String(days));
      const res = await http(`/api/analytics?${params.toString()}`, {
        method: "GET",
      });
      return parseApiResponse(res);
    },

    getSessionHistory: async (
      split: string | null = null,
      dayNumber: number | null = null,
      limit: number = 10,
      includeTimings: boolean = false,
    ): Promise<WorkoutSession[]> => {
      const params = new URLSearchParams();
      if (split) params.set("split", split);
      if (dayNumber) params.set("dayNumber", String(dayNumber));
      params.set("limit", String(limit));
      params.set("includeTimings", String(includeTimings));
      const res = await http(`/api/sessions?${params.toString()}`, {
        method: "GET",
      });
      const data = await parseApiResponse<{ sessions?: WorkoutSession[] }>(res);
      return (data.sessions ?? []).map(normalizeSession);
    },

    /**
     * One page of history, newest first. `nextCursor` is null on the last page,
     * and always null from servers that predate paging.
     */
    getSessionHistoryPage: async (
      split: string | null = null,
      before: string | null = null,
      limit: number = 1000,
      includeTimings: boolean = false,
    ): Promise<SessionHistoryPage> => {
      const params = new URLSearchParams();
      if (split) params.set("split", split);
      if (before) params.set("before", before);
      params.set("limit", String(limit));
      params.set("includeTimings", String(includeTimings));
      const res = await http(`/api/sessions?${params.toString()}`, {
        method: "GET",
      });
      const data = await parseApiResponse<{
        sessions?: WorkoutSession[];
        nextCursor?: string | null;
      }>(res);
      return {
        sessions: (data.sessions ?? []).map(normalizeSession),
        nextCursor:
          typeof data.nextCursor === "string" && data.nextCursor
            ? data.nextCursor
            : null,
      };
    },

    /** Null from a server without the route. Its `/:sessionId` route answers 400 or 404 for it. */
    getRecordSessions: async (): Promise<WorkoutSession[] | null> => {
      const res = await http("/api/sessions/exercise-records", {
        method: "GET",
      });
      if (res.status === 400 || res.status === 404) return null;
      const data = await parseApiResponse<{ sessions?: WorkoutSession[] }>(res);
      return (data.sessions ?? []).map(normalizeSession);
    },

    getSession: async (
      sessionId: number | string,
    ): Promise<FullSessionWithGroups> => {
      const res = await http(`/api/sessions/${sessionId}`, { method: "GET" });
      const data = await parseApiResponse<{ session?: FullSessionWithGroups }>(
        res,
      );
      return normalizeSession(
        required(
          data.session,
          "getSession succeeded but response had no session",
          res.status,
        ),
      );
    },

    fillDemoData: async (
      program: WorkoutData,
      split: string,
    ): Promise<DemoFillResult> => {
      const res = await sendJson("/api/sessions/demo", "POST", {
        split,
        days: demoDays(program, split),
      });
      return parseApiResponse<DemoFillResult>(res);
    },

    clearDemoSessions: async (): Promise<unknown> => {
      const res = await http("/api/sessions/demo", { method: "DELETE" });
      return parseApiResponse(res);
    },

    deleteAllSessionsForSplit: async (split: string): Promise<unknown> => {
      const res = await http(
        `/api/sessions/split/${encodeURIComponent(split)}`,
        { method: "DELETE" },
      );
      return parseApiResponse(res);
    },

    // Wipes the user's server-side data while keeping the account. The server
    // requires the confirmation token and the account password in the body.
    deleteAllUserData: async (password: string): Promise<unknown> => {
      const res = await sendJson("/api/auth/account/data", "DELETE", {
        confirmDelete: "DELETE_ALL_DATA",
        password,
      });
      return parseApiResponse(res);
    },
  };
};

export type WorkoutApi = ReturnType<typeof makeWorkoutApi>;
