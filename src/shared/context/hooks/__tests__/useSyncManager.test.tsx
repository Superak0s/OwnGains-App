import React, { useState } from "react";
import { create, act } from "react-test-renderer";
import { useSyncManager } from "../useSyncManager";
import { workoutApi } from "@features/workout/services/index";
import { ApiError } from "@shared/services/apiError";
import type { PendingSync } from "../../../types";
import type {
  PendingSyncRow,
  PendingSyncStore,
} from "@shared/services/pendingSyncStore";

jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    startSession: jest.fn(),
    recordSet: jest.fn(),
    endSession: jest.fn(),
    updateSessionDay: jest.fn(),
  },
}));

const startSession = workoutApi.startSession as jest.Mock;
const recordSet = workoutApi.recordSet as jest.Mock;
const endSession = workoutApi.endSession as jest.Mock;
const updateSessionDay = workoutApi.updateSessionDay as jest.Mock;

function makeSync(timestamp: string): PendingSync {
  return {
    type: "startSession",
    data: { split: "local", dayNumber: 1 },
    timestamp,
  };
}

function fakeStore() {
  const rows = new Map<string, string>();
  const depths: number[] = [];
  const put = (list: PendingSyncRow[]) =>
    list.forEach((r) => rows.set(r.id, r.value));
  const store = {
    load: jest.fn(async () => []),
    replace: jest.fn(async (_userId: string | null, list: PendingSyncRow[]) => {
      rows.clear();
      put(list);
      depths.push(rows.size);
    }),
    apply: jest.fn(
      async (_userId: string | null, puts: PendingSyncRow[], ids: string[]) => {
        put(puts);
        ids.forEach((id) => rows.delete(id));
        depths.push(rows.size);
      },
    ),
  } satisfies PendingSyncStore;
  return { store, rows, depths };
}

type Control = {
  syncPendingData: () => Promise<void>;
  cleanupInvalidSyncs: () => Promise<void>;
  addPendingSync: (sync: PendingSync) => Promise<void>;
  getPendingSyncs: () => PendingSync[];
  getIsSyncing: () => boolean;
  getDroppedSyncs: () => { type: string; reason: string }[];
};

function Harness({
  initialSyncs,
  controlRef,
  queueStore = fakeStore().store,
}: {
  initialSyncs: PendingSync[];
  controlRef: React.MutableRefObject<Control | null>;
  queueStore?: PendingSyncStore;
}) {
  const [pendingSyncs, setPendingSyncs] = useState(initialSyncs);
  const [isSyncing, setIsSyncing] = useState(false);
  const sync = useSyncManager({
    pendingSyncs,
    setPendingSyncs,
    isSyncing,
    setIsSyncing,
    currentSessionId: null,
    setCurrentSessionId: () => {},
    userId: "u1",
    saveToStorage: jest.fn().mockResolvedValue(true),
    STORAGE_KEYS: { PENDING_SYNCS: "pending", CURRENT_SESSION_ID: "session" },
    useManualTime: true,
    queueStore,
  });
  controlRef.current = {
    syncPendingData: sync.syncPendingData,
    cleanupInvalidSyncs: sync.cleanupInvalidSyncs,
    addPendingSync: sync.addPendingSync,
    getPendingSyncs: () => pendingSyncs,
    getIsSyncing: () => isSyncing,
    getDroppedSyncs: () => sync.droppedSyncs,
  };
  return null;
}

const localStart = (localSessionId: string, timestamp: string): PendingSync =>
  ({
    type: "startSession",
    localSessionId,
    data: { split: "local", dayNumber: 1 },
    timestamp,
  }) as PendingSync;

const localSet = (sessionId: string, timestamp: string): PendingSync =>
  ({
    type: "recordSet",
    data: {
      sessionId,
      setIndex: 0,
      startTime: "s",
      endTime: "e",
      weight: 100,
      reps: 5,
    },
    timestamp,
  }) as PendingSync;

describe("useSyncManager retry/backoff", () => {
  beforeEach(() => {
    startSession.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps a failing sync queued and skips it during its backoff window", async () => {
    startSession.mockRejectedValue(new Error("network down"));
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={[makeSync("t1")]} controlRef={controlRef} />);
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(1);
    expect(startSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  const runAfterBackoff = async (
    controlRef: React.MutableRefObject<Control | null>,
    times: number,
  ): Promise<void> => {
    for (let i = 0; i < times; i++) {
      jest.setSystemTime(Date.now() + 40 * 60_000);
      await act(async () => {
        await controlRef.current!.syncPendingData();
      });
    }
  };

  it("drops a sync after MAX_SYNC_RETRIES server rejections", async () => {
    startSession.mockRejectedValue(new ApiError("Invalid split", 400));
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={[makeSync("t1")]} controlRef={controlRef} />);
    });

    await runAfterBackoff(controlRef, 9);

    expect(controlRef.current!.getPendingSyncs()).toHaveLength(0);
    expect(startSession).toHaveBeenCalledTimes(9);
    expect(controlRef.current!.getDroppedSyncs()).toEqual([
      expect.objectContaining({ reason: "retries_exhausted" }),
    ]);
  });

  it.each([
    ["a transport failure", new TypeError("Network request failed")],
    ["a timeout", new Error("Request timed out after 15000ms")],
    ["a 5xx", new ApiError("Bad gateway", 502)],
    ["a rate limit", new ApiError("Too many requests", 429)],
    ["an expired session", new ApiError("SESSION_EXPIRED", 401)],
  ])("never drops a sync that keeps failing with %s", async (_label, error) => {
    startSession.mockRejectedValue(error);
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={[makeSync("t1")]} controlRef={controlRef} />);
    });

    await runAfterBackoff(controlRef, 20);

    expect(startSession).toHaveBeenCalledTimes(20);
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(1);
    expect(controlRef.current!.getDroppedSyncs()).toEqual([]);
  });

  it("keeps a rejected startSession while its sets are still queued", async () => {
    startSession.mockRejectedValue(new ApiError("Invalid split", 400));
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(
        <Harness
          initialSyncs={[localStart("local_1", "t1"), localSet("local_1", "t2")]}
          controlRef={controlRef}
        />,
      );
    });

    await runAfterBackoff(controlRef, 12);
    await act(async () => {
      await controlRef.current!.cleanupInvalidSyncs();
    });

    expect(controlRef.current!.getPendingSyncs()).toHaveLength(2);
    expect(controlRef.current!.getDroppedSyncs()).toEqual([]);
  });
});

describe("useSyncManager local-to-server ID remapping on replay", () => {
  beforeEach(() => {
    startSession.mockReset();
    recordSet.mockReset();
    endSession.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("remaps recordSet and endSession to the server ID from a startSession synced earlier in the same batch", async () => {
    startSession.mockResolvedValue(999);
    recordSet.mockResolvedValue(undefined);
    endSession.mockResolvedValue(undefined);

    const syncs: PendingSync[] = [
      {
        type: "startSession",
        localSessionId: "local_1",
        data: { split: "local", dayNumber: 1 },
        timestamp: "t1",
      },
      {
        type: "recordSet",
        data: {
          sessionId: "local_1",
          setIndex: 0,
          startTime: "s",
          endTime: "e",
          weight: 100,
          reps: 5,
        },
        timestamp: "t2",
      },
      {
        type: "endSession",
        data: { sessionId: "local_1" },
        timestamp: "t3",
      },
    ];

    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={syncs} controlRef={controlRef} />);
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(recordSet).toHaveBeenCalledWith("999", {
      exerciseName: "Unknown Exercise",
      setIndex: 0,
      startTime: "s",
      endTime: "e",
      weight: 100,
      reps: 5,
      note: undefined,
      isWarmup: undefined,
      primaryMuscles: [],
      secondaryMuscles: [],
    }, expect.any(String));
    expect(endSession).toHaveBeenCalledWith("999", "t3", expect.any(String));
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(0);
  });

  it("remaps a queued day change to the server ID of the session it moved", async () => {
    startSession.mockResolvedValue(999);
    updateSessionDay.mockResolvedValue(undefined);

    const syncs: PendingSync[] = [
      {
        type: "startSession",
        localSessionId: "local_1",
        data: { split: "local", dayNumber: 1 },
        timestamp: "t1",
      },
      {
        type: "updateSessionDay",
        syncId: "sync_2",
        data: { sessionId: "local_1", dayNumber: 3, dayTitle: "Legs" },
        timestamp: "t2",
      },
    ];

    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={syncs} controlRef={controlRef} />);
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(updateSessionDay).toHaveBeenCalledWith("999", 3, "Legs", "sync_2");
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(0);
  });

  it("replays a session with its original times and its sync id as the idempotency key", async () => {
    startSession.mockResolvedValue(7);
    endSession.mockResolvedValue(undefined);
    const syncs: PendingSync[] = [
      {
        type: "startSession",
        syncId: "sync-start",
        localSessionId: "local_2",
        data: { split: "ppl", dayNumber: 2, dayTitle: "Pull" },
        timestamp: "2026-09-20T18:00:00.000+02:00",
      },
      {
        type: "endSession",
        syncId: "sync-end",
        data: { sessionId: "local_2" },
        timestamp: "2026-09-20T19:05:00.000+02:00",
      },
    ];

    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={syncs} controlRef={controlRef} />);
    });
    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(startSession).toHaveBeenCalledWith(
      "ppl",
      2,
      "Pull",
      undefined,
      undefined,
      false,
      "2026-09-20T18:00:00.000+02:00",
      "sync-start",
    );
    expect(endSession).toHaveBeenCalledWith(
      "7",
      "2026-09-20T19:05:00.000+02:00",
      "sync-end",
    );
  });

  it("drops a recordSet still pointing at a local session ID instead of retrying forever", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    const syncs: PendingSync[] = [
      {
        type: "recordSet",
        data: {
          sessionId: "local_orphan",
          setIndex: 0,
          startTime: "s",
          endTime: "e",
          weight: 100,
          reps: 5,
        },
        timestamp: "t1",
      },
    ];

    act(() => {
      create(<Harness initialSyncs={syncs} controlRef={controlRef} />);
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(recordSet).not.toHaveBeenCalled();
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(1);
  });
});

describe("useSyncManager isSyncing lifecycle", () => {
  beforeEach(() => {
    startSession.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports a failed queue write, clears isSyncing, and rewrites the whole queue next time", async () => {
    startSession.mockResolvedValue(999);
    const { store } = fakeStore();
    store.replace.mockRejectedValueOnce(new Error("disk full"));
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(
        <Harness
          initialSyncs={[makeSync("t1"), makeSync("t2")]}
          controlRef={controlRef}
          queueStore={store}
        />,
      );
    });

    startSession.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await expect(controlRef.current!.syncPendingData()).resolves.toBeUndefined();
    });
    expect(controlRef.current!.getIsSyncing()).toBe(false);
    expect(store.apply).not.toHaveBeenCalled();

    await act(async () => {
      await controlRef.current!.addPendingSync(makeSync("t3"));
    });
    expect(store.replace).toHaveBeenCalledTimes(2);
    expect(store.apply).not.toHaveBeenCalled();
  });

});

describe("useSyncManager queue integrity", () => {
  beforeEach(() => {
    startSession.mockReset();
    startSession.mockResolvedValue("s1");
  });

  it("keeps both entries when two syncs are queued in the same tick", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={[]} controlRef={controlRef} />);
    });

    await act(async () => {
      await Promise.all([
        controlRef.current!.addPendingSync(makeSync("t1")),
        controlRef.current!.addPendingSync(makeSync("t2")),
      ]);
    });

    expect(controlRef.current!.getPendingSyncs().map((s) => s.timestamp)).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("does not discard a sync queued while a sync run is in flight", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    let queueDuringRun: Promise<void> | null = null;
    startSession.mockImplementation(async () => {
      queueDuringRun ??= controlRef.current!.addPendingSync(makeSync("t2"));
      await queueDuringRun;
      return "s1";
    });

    act(() => {
      create(<Harness initialSyncs={[makeSync("t1")]} controlRef={controlRef} />);
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(controlRef.current!.getPendingSyncs().map((s) => s.timestamp)).toEqual([
      "t2",
    ]);
  });
});

describe("useSyncManager queue rows", () => {
  it("writes only the new op once the stored rows are known", async () => {
    const { store, rows } = fakeStore();
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(<Harness initialSyncs={[]} controlRef={controlRef} queueStore={store} />);
    });

    await act(async () => {
      await controlRef.current!.addPendingSync(makeSync("t1"));
    });
    await act(async () => {
      await controlRef.current!.addPendingSync(makeSync("t2"));
    });

    expect(store.replace).toHaveBeenCalledTimes(1);
    expect(store.apply).toHaveBeenCalledTimes(1);
    const [, puts, deleteIds] = store.apply.mock.calls[0];
    expect(puts.map((r) => JSON.parse(r.value).timestamp)).toEqual(["t2"]);
    expect(deleteIds).toEqual([]);
    expect(rows.size).toBe(2);
  });
});

describe("useSyncManager cleanupInvalidSyncs", () => {
  beforeEach(() => {
    startSession.mockReset();
    recordSet.mockReset();
    endSession.mockReset();
  });

  it("keeps local-session ops whose startSession is still queued", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(
        <Harness
          initialSyncs={[localStart("local_1", "t1"), localSet("local_1", "t2")]}
          controlRef={controlRef}
        />,
      );
    });

    await act(async () => {
      await controlRef.current!.cleanupInvalidSyncs();
    });

    expect(controlRef.current!.getPendingSyncs()).toHaveLength(2);
  });

  it("drops and reports local-session ops whose startSession is gone", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    act(() => {
      create(
        <Harness
          initialSyncs={[localSet("local_orphan", "t2")]}
          controlRef={controlRef}
        />,
      );
    });

    await act(async () => {
      await controlRef.current!.cleanupInvalidSyncs();
    });

    expect(controlRef.current!.getPendingSyncs()).toHaveLength(0);
    expect(controlRef.current!.getDroppedSyncs()).toEqual([
      expect.objectContaining({
        type: "recordSet",
        reason: "local_id",
      }),
    ]);
  });
});

describe("useSyncManager replay ordering and durability", () => {
  beforeEach(() => {
    startSession.mockReset();
    recordSet.mockReset();
    endSession.mockReset();
  });

  it("persists the shrinking queue every 10 ops and once at the end", async () => {
    startSession.mockResolvedValue(999);
    recordSet.mockResolvedValue(undefined);
    const { store, depths } = fakeStore();
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    const sets = Array.from({ length: 11 }, (_, i) =>
      localSet("local_1", `t${String(i + 2).padStart(2, "0")}`),
    );

    act(() => {
      create(
        <Harness
          initialSyncs={[localStart("local_1", "t01"), ...sets]}
          controlRef={controlRef}
          queueStore={store}
        />,
      );
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(depths).toEqual([2, 0]);
    expect(recordSet).toHaveBeenCalledTimes(11);
  });

  it("caps a long backlog replay at about ten queue writes", async () => {
    startSession.mockResolvedValue(999);
    recordSet.mockResolvedValue(undefined);
    const { store, depths } = fakeStore();
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    const sets = Array.from({ length: 499 }, (_, i) =>
      localSet("local_1", `t${String(i + 2).padStart(4, "0")}`),
    );

    act(() => {
      create(
        <Harness
          initialSyncs={[localStart("local_1", "t0001"), ...sets]}
          controlRef={controlRef}
          queueStore={store}
        />,
      );
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(depths).toHaveLength(10);
    expect(depths.at(-1)).toBe(0);
    expect(recordSet).toHaveBeenCalledTimes(499);
  });

  it("holds back endSession when an earlier set for the same session failed", async () => {
    recordSet.mockRejectedValue(new Error("network down"));
    endSession.mockResolvedValue(undefined);
    const controlRef: React.MutableRefObject<Control | null> = { current: null };

    act(() => {
      create(
        <Harness
          initialSyncs={[
            localSet("77", "t1"),
            { type: "endSession", data: { sessionId: "77" }, timestamp: "t2" },
          ]}
          controlRef={controlRef}
        />,
      );
    });

    await act(async () => {
      await controlRef.current!.syncPendingData();
    });

    expect(endSession).not.toHaveBeenCalled();
    expect(controlRef.current!.getPendingSyncs()).toHaveLength(2);
  });
});
