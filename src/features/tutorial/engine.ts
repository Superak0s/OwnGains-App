import type { ChapterId } from "./chapters";

export interface Cursor {
  readonly queue: readonly ChapterId[];
  readonly chapter: number;
  readonly step: number;
}

export type StepCount = (id: ChapterId) => number;

export function advance(
  c: Cursor,
  count: StepCount,
): { cursor: Cursor | null; completed: ChapterId | null } {
  const id = c.queue[c.chapter];
  if (c.step + 1 < count(id)) return { cursor: { ...c, step: c.step + 1 }, completed: null };
  const next = c.chapter + 1;
  return {
    cursor: next < c.queue.length ? { ...c, chapter: next, step: 0 } : null,
    completed: id,
  };
}

export function retreat(c: Cursor, count: StepCount): Cursor {
  if (c.step > 0) return { ...c, step: c.step - 1 };
  if (c.chapter === 0) return c;
  const prev = c.chapter - 1;
  return { ...c, chapter: prev, step: count(c.queue[prev]) - 1 };
}

export function skip(c: Cursor): Cursor | null {
  const next = c.chapter + 1;
  return next < c.queue.length ? { ...c, chapter: next, step: 0 } : null;
}
