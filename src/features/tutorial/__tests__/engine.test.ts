import { advance, retreat, skip, type Cursor } from "../engine";
import type { ChapterId } from "../chapters";

const count = (id: ChapterId) => ({ welcome: 2, home: 1 } as Record<string, number>)[id] ?? 1;
const at = (chapter: number, step: number): Cursor => ({ queue: ["welcome", "home"], chapter, step });

it("advances within a chapter without completing it", () => {
  expect(advance(at(0, 0), count)).toEqual({ cursor: at(0, 1), completed: null });
});

it("completes a chapter on its last step and moves to the next", () => {
  expect(advance(at(0, 1), count)).toEqual({ cursor: at(1, 0), completed: "welcome" });
});

it("ends after the last step of the last chapter", () => {
  expect(advance(at(1, 0), count)).toEqual({ cursor: null, completed: "home" });
});

it("goes back into the previous chapter's last step and stops at the very start", () => {
  expect(retreat(at(1, 0), count)).toEqual(at(0, 1));
  expect(retreat(at(0, 1), count)).toEqual(at(0, 0));
  expect(retreat(at(0, 0), count)).toEqual(at(0, 0));
});

it("skips a chapter without completing it, and ends after the last", () => {
  expect(skip(at(0, 1))).toEqual(at(1, 0));
  expect(skip(at(1, 0))).toBeNull();
});
