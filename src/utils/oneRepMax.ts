/** Epley. `load` is the effective weight moved, already net of any assistance. */
export function estimateOneRepMax(load: number, reps: number): number {
  if (!Number.isFinite(load) || !Number.isFinite(reps) || load <= 0 || reps <= 0)
    return 0
  return reps === 1 ? load : load * (1 + reps / 30)
}
