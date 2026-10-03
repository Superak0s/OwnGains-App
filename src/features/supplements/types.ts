export interface SupplementTemplate {
  name: string;
  icon: string;
  unit: string;
  defaultAmount: number;
  color: string;
  description: string;
}

export interface SupplementSummary {
  id: number;
  name: string;
  unit: string;
  defaultAmount: number;
  reminderEnabled: boolean;
  reminderTime: string | null;
  color: string | null;
  icon: string | null;
  dosesPerDay: number;
  doseIntervalMinutes: number | null;
  takenToday: boolean;
  dosesToday: number;
  lastTakenAt: string | null;
  streak: number;
}

export interface SupplementEntry {
  id: number;
  supplementId: number;
  amount: number;
  takenAt: string;
  note: string | null;
  createdAt: string;
}

export interface CreateSupplementParams {
  name: string;
  unit?: string;
  defaultAmount?: number;
  reminderEnabled?: boolean;
  reminderTime?: string | null;
  color?: string | null;
  icon?: string | null;
  dosesPerDay?: number;
  doseIntervalMinutes?: number | null;
}

export type UpdateSupplementParams = Partial<CreateSupplementParams>;

export interface LogSupplementParams {
  amount?: number;
  takenAt?: string | null;
  note?: string | null;
}

export interface SupplementLogResponse {
  success: boolean;
  entries: SupplementEntry[];
  streak: number;
  takenToday: boolean;
  todayEntry: SupplementEntry | null;
}
