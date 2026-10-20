export interface ScheduledWorkout {
  id: number;
  title: string;
  programDay: number | null;
  /** ISO timestamp. */
  startAt: string;
  durationMin: number;
  /** Minutes before `startAt` to remind, or null for no reminder. */
  reminderMinutes: number | null;
  alarm: boolean;
  /** "cancelled" only comes back when the list asks for cancelled entries. */
  status: "pending" | "accepted" | "cancelled";
  /** The trainer who suggested it, or null for the user's own. */
  scheduledBy: { uuid: string; username: string } | null;
}

export interface ScheduleParams {
  title: string;
  startAt: string;
  programDay?: number | null;
  durationMin?: number;
  reminderMinutes?: number | null;
  alarm?: boolean;
}
