import React from "react";
import { create, act } from "react-test-renderer";
import { useHydrationTab } from "../useHydrationTab";
import { hydrationApi } from "../../services";

jest.mock("../../services", () => ({
  hydrationApi: { logHydration: jest.fn(), deleteHydrationEntry: jest.fn() },
}));

const logHydration = hydrationApi.logHydration as jest.Mock;

type Control = ReturnType<typeof useHydrationTab>;

const alert = jest.fn();
const setSelectedLogDate = jest.fn();

function Harness({
  controlRef,
  selectedLogDate,
}: {
  controlRef: React.MutableRefObject<Control | null>;
  selectedLogDate: Date | null;
}) {
  controlRef.current = useHydrationTab({
    alert,
    loadTabData: jest.fn(async () => {}),
    setDayModal: jest.fn(),
    selectedLogDate,
    setSelectedLogDate,
    buildLocalISOForDate: (d, t) => `${d.toISOString().slice(0, 10)}T${t}`,
  });
  return null;
}

async function logAmount(amount: string, selectedLogDate: Date | null = null) {
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} selectedLogDate={selectedLogDate} />);
  });
  await act(async () => {
    controlRef.current!.setNewHydrationAmount(amount);
  });
  await act(async () => {
    await controlRef.current!.handleLogHydration();
  });
  return controlRef.current!;
}

beforeEach(() => {
  jest.clearAllMocks();
  logHydration.mockResolvedValue(undefined);
});

describe("useHydrationTab.handleLogHydration", () => {
  it("rejects a blank or non-numeric amount", async () => {
    await logAmount("");
    await logAmount("lots");
    expect(logHydration).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("backdates to the picked calendar day and clears the form", async () => {
    const tab = await logAmount("500", new Date("2026-09-20T12:00:00Z"));
    expect(logHydration).toHaveBeenCalledWith(500, undefined, "2026-09-20T08:00", expect.any(String));
    expect(tab.newHydrationAmount).toBe("");
    expect(setSelectedLogDate).toHaveBeenCalledWith(null);
  });

  it("keeps the amount when the save fails so it can be retried", async () => {
    logHydration.mockRejectedValue(new Error("offline"));
    const tab = await logAmount("250");
    expect(tab.newHydrationAmount).toBe("250");
    expect(alert).toHaveBeenCalledWith("Couldn't log hydration", expect.any(String), expect.any(Array), "error");
  });

  it("resends a failed save with the same idempotency key, and a new entry with a new one", async () => {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    await act(async () => {
      create(<Harness controlRef={controlRef} selectedLogDate={null} />);
    });
    const submit = async (amount: string) => {
      await act(async () => {
        controlRef.current!.setNewHydrationAmount(amount);
      });
      await act(async () => {
        await controlRef.current!.handleLogHydration();
      });
    };
    logHydration.mockRejectedValueOnce(new Error("timeout"));
    await submit("300");
    await submit("300");
    await submit("300");
    const keys = logHydration.mock.calls.map((call) => call[3]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
