import type { SetTiming, GroupedExercise } from "@shared/types";

export type { GroupedExercise } from "@shared/types";

export interface Friend {
  id: number | string;
  username: string;
  createdAt: string;
}

export type UserRef = Pick<Friend, "id" | "username">;

/** Shapes returned when a friend shares a program. Looser than the local
 * program types, so they are kept separate from `@shared/types`. */
export interface ProgramExercise {
  name?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  sets?: number;
  setsBySplit?: Record<string, number | string>;
  reps?: string | number;
}

export interface ProgramDay {
  dayNumber?: number;
  dayTitle?: string;
  exercises?: ProgramExercise[];
  split?: Record<string, { exercises?: ProgramExercise[] }>;
  people?: Record<string, { exercises?: ProgramExercise[] }>;
}

export interface ProgramData {
  name?: string;
  totalDays?: number;
  split?: string[];
  people?: string[];
  days?: ProgramDay[];
}

export interface ReceivedProgram {
  id: number | string;
  senderId: number | string;
  senderUsername: string;
  sharedAt: string;
  message: string | null;
  programData: ProgramData;
}

export interface LiveData {
  startTime?: string;
  dayNumber?: number;
  dayTitle?: string;
  setTimings?: SetTiming[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

export type Phase =
  | "idle"
  | "checking"
  | "watching"
  | "no_session"
  | "ended"
  | "error";

export interface ExerciseEntry {
  exerciseName: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  totalSets: number;
  completedSetMap: Record<number, SetTiming>;
}

export interface SessionRecord {
  id: number | string;
  dayNumber?: number;
  dayTitle?: string;
  startTime?: string | number;
  totalDuration?: number;
  completedSets?: number;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  setTimings?: SetTiming[];
  groupedExercises?: GroupedExercise[];
}

export interface UserSearchResult {
  id: number | string;
  username: string;
}

export interface PendingFriendRequest {
  id: number | string;
  senderId: number | string;
  senderUsername: string;
  senderName?: string;
  createdAt: string;
}

export interface SentFriendRequest {
  id: number | string;
  receiverId: number | string;
  receiverUsername: string;
  receiverName?: string;
  createdAt: string;
}

export type FriendId = number | string | undefined;

export type PermissionType =
  | "history"
  | "analytics"
  | "program"
  | "joint_session"
  | "watch_session"
  | "trainer";

export interface GrantedPermission {
  id: number | string;
  toUserId: number | string;
  toUsername: string;
  permissionType: PermissionType;
  payload: Record<string, unknown> | null;
  hasPayload: boolean;
  createdAt: string;
}

export interface ReceivedPermission {
  id: number | string;
  fromUserId: number | string;
  fromUsername: string;
  permissionType: PermissionType;
  payload: Record<string, unknown> | null;
  hasPayload: boolean;
  createdAt: string;
}

export interface JointInviteParams {
  toUserId: number | string;
}

export interface BlockedUser {
  id: number | string;
  username: string;
  name: string;
  blockedAt: string;
}

export const REPORT_REASONS = [
  { key: "harassment", label: "Harassment or bullying" },
  { key: "spam", label: "Spam or scam" },
  { key: "impersonation", label: "Impersonation" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];
