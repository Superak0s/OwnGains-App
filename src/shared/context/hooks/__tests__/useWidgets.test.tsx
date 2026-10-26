import React from "react";
import { create, act } from "react-test-renderer";
import { BackHandler } from "react-native";
import { NavigationContext } from "@react-navigation/native";
import { useWidgets, useWidgetBoard } from "../useWidgets";
import { loadFromStorage, saveToStorage } from "@shared/services/storage";
import { showToast } from "@shared/components/toast";
import type { WidgetDefinition, WidgetInstance, WidgetSize } from "@shared/types";

jest.mock("@shared/services/storage", () => ({
  loadFromStorage: jest.fn(),
  saveToStorage: jest.fn(),
}));
jest.mock("@shared/components/toast", () => ({ showToast: jest.fn() }));
jest.mock("@shared/context/hooks/useTwoFingerPull", () => ({
  useTwoFingerPull: () => ({ panHandlers: {}, isPulling: false, pullArmed: false }),
}));

const load = loadFromStorage as jest.Mock;
const save = saveToStorage as jest.Mock;

type T = "a" | "b" | "c";
const def = (type: T, availableSizes: WidgetSize[] = ["small", "medium"]): WidgetDefinition<T> => ({
  type,
  title: type.toUpperCase(),
  description: "",
  availableSizes,
  defaultSize: availableSizes[0],
});
const registry: Record<T, WidgetDefinition<T>> = { a: def("a"), b: def("b", ["large"]), c: def("c") };
const inst = (id: string, type: string, order: number, size: WidgetSize = "small") =>
  ({ id, type, size, order }) as WidgetInstance<T>;
const defaults = [inst("d1", "a", 0)];

type Control = ReturnType<typeof useWidgets<T>>;

function Harness({ controlRef }: { controlRef: React.MutableRefObject<Control | null> }) {
  controlRef.current = useWidgets<T>("u1", { registry, defaults, storageKey: "board" });
  return null;
}

async function mount(stored: unknown) {
  load.mockResolvedValue(stored);
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} />);
  });
  return controlRef;
}

beforeEach(() => {
  jest.clearAllMocks();
  save.mockResolvedValue(true);
});

describe("useWidgets", () => {
  it("drops stored widgets whose type left the registry and sorts the rest", async () => {
    const board = await mount([inst("2", "c", 5), inst("x", "renamed", 0), inst("1", "a", 1)]);
    expect(board.current!.widgets.map((w) => w.id)).toEqual(["1", "2"]);
    expect(board.current!.availableToAdd.map((d) => d.type)).toEqual(["b"]);
  });

  it("resets a stored size the widget no longer offers to its default", async () => {
    const board = await mount([inst("1", "a", 0, "large"), inst("2", "c", 1, "medium")]);
    expect(board.current!.widgets.map((w) => w.size)).toEqual(["small", "medium"]);
  });

  it("falls back to the defaults when nothing known is stored", async () => {
    expect((await mount(null)).current!.widgets).toEqual(defaults);
    expect((await mount([inst("x", "gone", 0)])).current!.widgets).toEqual(defaults);
  });

  it("refuses a duplicate widget and appends a new one at its default size", async () => {
    const board = await mount([inst("1", "a", 0)]);
    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      result = await board.current!.addWidget("a");
    });
    expect(result).toEqual({ success: false, error: "A is already on this board" });

    await act(async () => {
      result = await board.current!.addWidget("b");
    });
    expect(result).toEqual({ success: true, title: "B" });
    expect(board.current!.widgets.map((w) => [w.type, w.size, w.order])).toEqual([
      ["a", "small", 0],
      ["b", "large", 1],
    ]);
  });

  it("renumbers the order after a remove or reorder", async () => {
    const board = await mount([inst("1", "a", 0), inst("2", "b", 1), inst("3", "c", 2)]);
    await act(async () => {
      await board.current!.removeWidget("1");
    });
    expect(board.current!.widgets.map((w) => [w.id, w.order])).toEqual([["2", 0], ["3", 1]]);

    await act(async () => {
      await board.current!.reorderWidgets(["3", "missing", "2"]);
    });
    expect(board.current!.widgets.map((w) => [w.id, w.order])).toEqual([["3", 0], ["2", 1]]);
  });

  it("cycles through the sizes a widget offers and leaves single-size widgets alone", async () => {
    const board = await mount([inst("1", "a", 0), inst("2", "b", 1, "large")]);
    await act(async () => {
      await board.current!.cycleWidgetSize("1");
      await board.current!.cycleWidgetSize("2");
    });
    expect(board.current!.widgets.map((w) => w.size)).toEqual(["medium", "large"]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rolls the layout back and tells the user when the write fails", async () => {
    save.mockResolvedValue(false);
    const board = await mount([inst("1", "a", 0)]);
    await act(async () => {
      await board.current!.removeWidget("1");
    });
    expect(board.current!.widgets.map((w) => w.id)).toEqual(["1"]);
    expect(showToast).toHaveBeenCalled();
  });

  it("stores a widget's custom details trimmed and keeps its type, and a blank field falls back", async () => {
    const board = await mount([inst("1", "a", 0), inst("2", "c", 1)]);
    await act(async () => {
      await board.current!.customizeWidget("1", { title: "  Legs  ", icon: "🦵", subtitle: " " });
    });
    expect(board.current!.widgets[0]).toEqual({ ...inst("1", "a", 0), title: "Legs", icon: "🦵" });
    expect(board.current!.widgets[1]).toEqual(inst("2", "c", 1));

    await act(async () => {
      await board.current!.customizeWidget("1", { title: "" });
    });
    expect(JSON.parse(JSON.stringify(save.mock.lastCall[1][0]))).toEqual(inst("1", "a", 0));
  });

  it("keeps stored custom details on load", async () => {
    const board = await mount([{ ...inst("1", "a", 0), title: "Mine", subtitle: "sub" }]);
    expect(board.current!.widgets[0]).toMatchObject({ type: "a", title: "Mine", subtitle: "sub" });
  });

  it("restores the board's defaults after the layout was changed", async () => {
    const board = await mount([inst("1", "b", 0, "large"), inst("2", "c", 1)]);
    await act(async () => {
      await board.current!.resetToDefaults();
    });
    expect(board.current!.widgets).toEqual(defaults);
    expect(save).toHaveBeenLastCalledWith("board", defaults, "u1");
  });
});

describe("useWidgetBoard edit mode", () => {
  type Board = ReturnType<typeof useWidgetBoard<T>>;
  const noopAdd = async () => ({ success: true });

  function BoardHarness({ boardRef }: { boardRef: React.MutableRefObject<Board | null> }) {
    boardRef.current = useWidgetBoard<T>(noopAdd);
    return null;
  }

  it("leaves edit mode when the screen loses focus", async () => {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
        return () => delete listeners[event];
      }),
    };
    const boardRef: React.MutableRefObject<Board | null> = { current: null };
    await act(async () => {
      create(
        <NavigationContext.Provider value={navigation as never}>
          <BoardHarness boardRef={boardRef} />
        </NavigationContext.Provider>,
      );
    });
    act(() => boardRef.current!.setEditMode(true));
    expect(boardRef.current!.editMode).toBe(true);
    act(() => listeners.blur());
    expect(boardRef.current!.editMode).toBe(false);
  });

  it("consumes Android Back to leave edit mode", async () => {
    let handler: (() => boolean) | null = null;
    const spy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_event, cb) => {
        handler = cb as () => boolean;
        return { remove: () => (handler = null) };
      });
    const boardRef: React.MutableRefObject<Board | null> = { current: null };
    await act(async () => {
      create(<BoardHarness boardRef={boardRef} />);
    });
    act(() => boardRef.current!.setEditMode(true));
    let consumed = false;
    act(() => {
      consumed = handler!();
    });
    expect(consumed).toBe(true);
    expect(boardRef.current!.editMode).toBe(false);
    expect(handler).toBeNull();
    spy.mockRestore();
  });
});
