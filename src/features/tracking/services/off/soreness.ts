import { createRecordStore, nextLocalId } from "@shared/services/offlineHelpers"
import type {
  ApiResponse,
  DOMSStats,
  LogSorenessParams,
  SorenessEntry,
  UpdateSorenessParams,
} from "../../types/muscleRecovery"

const HISTORY_KEY = "@off_soreness_history"

const store = createRecordStore<SorenessEntry>(
  "soreness_entries",
  HISTORY_KEY,
  (e) => e.id,
  (e) => e.loggedAt,
)

const statusFor = (
  reported: UpdateSorenessParams["status"],
): SorenessEntry["status"] => {
  if (reported === "recovered") return "recovered"
  return reported === "better" ? "recovering" : "active"
}

export const sorenessApi = {
  logSoreness: async ({
    muscleGroup,
    intensity,
    note,
    loggedAt,
  }: LogSorenessParams): Promise<ApiResponse<SorenessEntry>> => {
    const now = new Date().toISOString()
    const entry: SorenessEntry = {
      id: nextLocalId(),
      muscleGroup,
      intensity: Math.round(intensity),
      note: note || null,
      loggedAt: loggedAt || now,
      updatedAt: now,
      status: "active",
      followUps: [],
      createdAt: now,
    }
    await store.put(entry)
    return { success: true, data: entry }
  },

  getSorenessHistory: async (
    limit: number = 100,
  ): Promise<ApiResponse<SorenessEntry[]>> => ({
    success: true,
    data: await store.getRecent(limit),
  }),

  getActiveSoreness: async (): Promise<ApiResponse<SorenessEntry[]>> => {
    // SQLite matches fields only by equality, so the non-recovered filter is
    // two positive lookups merged here.
    const active = await store.getWhere({ status: "active" })
    const recovering = await store.getWhere({ status: "recovering" })
    return {
      success: true,
      data: [...active, ...recovering].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }
  },

  updateSoreness: async (
    params: UpdateSorenessParams,
  ): Promise<ApiResponse<SorenessEntry>> => {
    const [entry] = await sorenessApi.batchFollowUp([params]).then((r) => r.data)
    if (!entry) throw new Error("Soreness entry not found")
    return { success: true, data: entry }
  },

  batchFollowUp: async (
    updates: UpdateSorenessParams[],
  ): Promise<ApiResponse<SorenessEntry[]>> => {
    const now = new Date().toISOString()
    const updated: SorenessEntry[] = []

    for (const update of updates) {
      const entry = await store.getOne(update.sorenessId)
      if (!entry) continue
      const intensity = Math.round(update.intensity)
      entry.intensity = intensity
      entry.status = statusFor(update.status)
      entry.updatedAt = now
      if (update.status === "recovered" && !entry.recoveredAt)
        entry.recoveredAt = now
      if (update.note) entry.note = update.note
      entry.followUps = [
        ...entry.followUps,
        {
          id: nextLocalId(),
          sorenessId: entry.id,
          intensity,
          status: update.status,
          note: update.note || null,
          createdAt: now,
        },
      ]
      await store.put(entry)
      updated.push(entry)
    }

    return { success: true, data: updated }
  },

  getHistoryByMuscle: async (
    muscle: string,
  ): Promise<ApiResponse<SorenessEntry[]>> => {
    const entries = await store.getWhere({ muscleGroup: muscle })
    return {
      success: true,
      data: entries
        .toSorted(
          (a, b) =>
            new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
        ),
    }
  },

  getStats: async (days: number = 30): Promise<ApiResponse<DOMSStats>> => {
    const entries = await store.getAll()
    const cutoff = Date.now() - days * 86400000
    const active = entries.filter((e) => e.status !== "recovered")
    const recovered = entries.filter(
      (e) => e.status === "recovered" && e.recoveredAt,
    )
    const averageRecoveryDays = recovered.length
      ? recovered.reduce(
          (sum, e) =>
            sum +
            Math.max(
              0,
              (new Date(e.recoveredAt!).getTime() -
                new Date(e.loggedAt).getTime()) /
                86400000,
            ),
          0,
        ) / recovered.length
      : 0
    const mostSore = [...active].sort((a, b) => b.intensity - a.intensity)[0]
    const recent = entries.filter(
      (e) => new Date(e.loggedAt).getTime() >= cutoff,
    )

    const heatmapData = {} as DOMSStats["heatmapData"]
    const intensitiesByDate: Record<string, number[]> = {}
    for (const e of recent) {
      heatmapData[e.muscleGroup] = (heatmapData[e.muscleGroup] ?? 0) + 1
      const date = e.loggedAt.slice(0, 10)
      intensitiesByDate[date] ??= []
      intensitiesByDate[date].push(e.intensity)
    }

    return {
      success: true,
      data: {
        totalActiveSoreness: active.length,
        totalRecoveryEpisodes: recovered.length,
        averageRecoveryDays: Number(averageRecoveryDays.toFixed(1)),
        mostSoreMuscle: mostSore?.muscleGroup ?? null,
        heatmapData,
        severityTrend: Object.entries(intensitiesByDate)
          .map(([date, intensities]) => ({
            date,
            averageIntensity: Number(
              (
                intensities.reduce((s, v) => s + v, 0) / intensities.length
              ).toFixed(1),
            ),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
    }
  },

  deleteSorenessEntry: async (id: number): Promise<ApiResponse<null>> => {
    await store.remove(id)
    return { success: true, data: null }
  },
}
