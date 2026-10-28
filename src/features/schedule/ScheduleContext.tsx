import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "@shared/context/AuthContext";
import { useJointSessionContextOptional } from "@shared/context/JointSessionContext";
import { onAppModeChange } from "@shared/services/appMode";
import { createEmitter } from "@utils/emitter";
import { demoDataChanged } from "@features/settings/utils/demoData";
import { captureUnreported, reportAndReturn } from "@shared/services/crashReporting";
import { scheduleApi } from "./services";
import { syncScheduleReminders } from "./reminders";
import { syncCalendar } from "./calendarSync";
import type { ScheduledWorkout, ScheduleParams } from "./types";
import { DAY_MS } from "@utils/format";

const WINDOW_DAYS = 400;

interface ScheduleContextValue {
  entries: ScheduledWorkout[];
  refresh: () => Promise<void>;
  create: (params: ScheduleParams) => Promise<void>;
  update: (id: number, patch: Partial<ScheduleParams>) => Promise<void>;
  accept: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export const useSchedule = (): ScheduleContextValue => {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useSchedule must be used inside ScheduleProvider");
  return value;
};

/** Fires with the client's uuid when a client changed a workout their trainer suggested. */
export const clientScheduleEvents = createEmitter<string>();

export function ScheduleProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const subscribeToSocket = useJointSessionContextOptional()?.subscribeToSocket;
  const signedIn = user?.id != null;
  const [entries, setEntries] = useState<ScheduledWorkout[]>([]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const from = new Date(Date.now() - DAY_MS);
    try {
      const list = await scheduleApi.list(from, new Date(from.getTime() + WINDOW_DAYS * DAY_MS));
      setEntries(list);
      await syncScheduleReminders(list).catch(reportAndReturn(undefined, { stage: "scheduleReminders" }));
      await syncCalendar(list, from).catch(reportAndReturn(undefined, { stage: "scheduleCalendar" }));
    } catch (error) {
      // A failed refresh keeps the last list and the reminders already set. The next foreground retries.
      captureUnreported(error, { stage: "scheduleRefresh" });
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setEntries([]);
      void syncScheduleReminders([]).catch(reportAndReturn(undefined, { stage: "scheduleRemindersClear" }));
      return;
    }
    void refresh();
    const unsubscribeMode = onAppModeChange.subscribe(() => void refresh());
    const unsubscribeDemo = demoDataChanged.subscribe(() => void refresh());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      unsubscribeMode();
      unsubscribeDemo();
      sub.remove();
    };
  }, [signedIn, refresh]);

  useEffect(() => {
    if (!signedIn || !subscribeToSocket) return;
    return subscribeToSocket((msg) => {
      if (msg.type !== "schedule_changed") return;
      if (typeof msg.clientUuid === "string") clientScheduleEvents.trigger(msg.clientUuid);
      else void refresh();
    });
  }, [signedIn, subscribeToSocket, refresh]);

  const value = useMemo<ScheduleContextValue>(() => {
    const then =
      <A extends unknown[]>(call: (...args: A) => Promise<unknown>) =>
      async (...args: A) => {
        await call(...args);
        await refresh();
      };
    return {
      entries,
      refresh,
      create: then(scheduleApi.create),
      update: then(scheduleApi.update),
      accept: then(scheduleApi.accept),
      remove: then(scheduleApi.remove),
    };
  }, [entries, refresh]);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}
