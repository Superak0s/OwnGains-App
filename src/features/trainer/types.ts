export interface ClientSummary {
  userId: string
  username: string
  lastWorkoutAt: string | null
  sessionsThisWeek: number
  activeProgramDayCount: number | null
  hasTrackingAccess: boolean
}

export interface TrainerRequest {
  id: string
  fromUserId: string
  fromUsername: string
  toUserId: string
  toUsername: string
  includeTracking: boolean
  createdAt: string
}

export class TrainerRequestConflictError extends Error {
  constructor() {
    super("Already your client or already requested.")
    this.name = "TrainerRequestConflictError"
  }
}
