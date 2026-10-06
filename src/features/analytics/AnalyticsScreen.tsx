import React, { useState, useEffect, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { useAuth } from "@shared/context/AuthContext";
import { useAlert } from "@shared/components/CustomAlert";
import ExerciseAnalytics from "./components/ExerciseAnalytics";
import type { AnalyticsWidgetType } from "./widgets";
import type { FullSessionWithGroups, WorkoutSession } from "@shared/types";
import { recordSessionsOutside } from "@utils/recordSets";
import { getCurrentBodyWeight } from "@features/tracking/services";
import { captureException, trackSpan } from "@shared/services/crashReporting";
import { userFacingError } from "@shared/services/apiError";

const ANALYTICS_HISTORY_LIMIT = 100;
const SHARED_HISTORY_TTL_MS = 30_000;

type SessionHistoryFetcher = (
  limit: number,
  includeTimings: boolean,
) => Promise<unknown>;
type RecordSessionsFetcher = () => Promise<WorkoutSession[] | null>;

interface SharedHistory {
  sessions: FullSessionWithGroups[];
  recordSessions: FullSessionWithGroups[];
  recordsAllTime: boolean;
}

// Every analytics widget placed on Home mounts its own AnalyticsScreen. They
// share one in-flight request instead of each pulling 100 sessions.
let sharedHistory: {
  userId: string | null;
  fetcher: SessionHistoryFetcher;
  recordsFetcher: RecordSessionsFetcher;
  fetchedAt: number;
  data: Promise<SharedHistory>;
} | null = null;

async function loadHistory(
  fetcher: SessionHistoryFetcher,
  recordsFetcher: RecordSessionsFetcher,
): Promise<SharedHistory> {
  const [window, records] = await Promise.all([
    fetcher(ANALYTICS_HISTORY_LIMIT, true),
    recordsFetcher(),
  ]);
  const sessions = (window as FullSessionWithGroups[] | null) ?? [];
  return {
    sessions,
    recordSessions: recordSessionsOutside(
      sessions,
      records as FullSessionWithGroups[] | null,
    ),
    recordsAllTime: records !== null,
  };
}

function fetchSharedHistory(
  userId: string | null,
  fetcher: SessionHistoryFetcher,
  recordsFetcher: RecordSessionsFetcher,
  force: boolean,
): Promise<SharedHistory> {
  if (
    !force &&
    sharedHistory?.userId === userId &&
    sharedHistory.fetcher === fetcher &&
    sharedHistory.recordsFetcher === recordsFetcher &&
    Date.now() - sharedHistory.fetchedAt < SHARED_HISTORY_TTL_MS
  ) {
    return sharedHistory.data;
  }
  const entry = {
    userId,
    fetcher,
    recordsFetcher,
    fetchedAt: Date.now(),
    data: loadHistory(fetcher, recordsFetcher),
  };
  sharedHistory = entry;
  entry.data.catch(() => {
    if (sharedHistory === entry) sharedHistory = null;
  });
  return entry.data;
}

export default function AnalyticsScreen({
  embedWidget,
}: {
  readonly embedWidget?: AnalyticsWidgetType;
} = {}): React.JSX.Element {
  const {
    workoutData,
    selectedSplit,
    completedDays,
    syncFromServer,
    fetchSessionHistory,
    fetchRecordSessions,
  } = useWorkoutPick(
    "workoutData",
    "selectedSplit",
    "completedDays",
    "syncFromServer",
    "fetchSessionHistory",
    "fetchRecordSessions",
  );

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { alert, AlertComponent } = useAlert();

  const [currentBodyWeight, setCurrentBodyWeight] = useState<number | null>(
    null,
  );
  const [sessions, setSessions] = useState<FullSessionWithGroups[]>([]);
  const [recordSessions, setRecordSessions] = useState<
    FullSessionWithGroups[]
  >([]);
  const [recordsAllTime, setRecordsAllTime] = useState(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBodyWeight = async (): Promise<void> => {
      if (!user?.id) return;

      try {
        const bodyWeight = await getCurrentBodyWeight(user.id);
        if (!cancelled && isMountedRef.current) {
          setCurrentBodyWeight(bodyWeight);
        }
      } catch (error) {
        if (!cancelled && isMountedRef.current) {
          console.error("Error loading body weight:", error);
          captureException(error, { stage: "loadBodyWeight" });
        }
      }
    };

    loadBodyWeight();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loadSessions = useCallback(async (force = false): Promise<void> => {
    if (!isMountedRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      const history = await trackSpan(
        "analytics.load_sessions",
        "screen.load",
        () =>
          fetchSharedHistory(
            userId,
            fetchSessionHistory,
            fetchRecordSessions,
            force,
          ),
      );

      if (isMountedRef.current) {
        setSessions(history.sessions);
        setRecordSessions(history.recordSessions);
        setRecordsAllTime(history.recordsAllTime);
        setIsLoading(false);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("Error loading sessions:", error);
        captureException(error, { stage: "loadSessions", screen: "analytics" });
        setError(
          userFacingError(error, "Couldn't load your workout history."),
        );
        setIsLoading(false);

        // Embeds show the error inline, since one alert per Home widget would stack.
        if (!embedWidget)
          alert(
            "Load Failed",
            "Unable to load your workout history. Please try again.",
            [{ text: "OK" }],
            "error",
          );
      }
    }
  }, [userId, fetchSessionHistory, fetchRecordSessions, alert, embedWidget]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const onRefresh = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current || refreshing) return;

    setRefreshing(true);
    setError(null);

    try {
      await syncFromServer();
      await loadSessions(true);
    } catch (error) {
      if (isMountedRef.current) {
        console.error("Error refreshing data:", error);
        captureException(error, { stage: "refresh", screen: "analytics" });
        setError(userFacingError(error, "Couldn't refresh your data."));

        alert(
          "Refresh Failed",
          "Unable to refresh your data. Please check your connection and try again.",
          [{ text: "OK" }],
          "error",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [syncFromServer, loadSessions, refreshing, alert]);

  return (
    <SafeAreaView
      style={embedWidget ? undefined : { flex: 1 }}
      edges={embedWidget ? [] : ["top"]}
    >
      <ExerciseAnalytics
        embedWidget={embedWidget}
        sessions={sessions}
        recordSessions={recordSessions}
        recordsAllTime={recordsAllTime}
        workoutData={workoutData}
        selectedSplit={selectedSplit}
        completedDays={completedDays}
        currentBodyWeight={currentBodyWeight}
        onRefresh={embedWidget ? null : onRefresh}
        refreshing={refreshing}
        title='Progress'
        isLoading={isLoading}
        error={error}
        userId={user?.id ?? null}
        historyLimit={ANALYTICS_HISTORY_LIMIT}
      />
      {AlertComponent}
    </SafeAreaView>
  );
}
