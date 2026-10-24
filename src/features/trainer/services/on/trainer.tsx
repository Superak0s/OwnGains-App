import { ApiError, apiCall } from "@shared/services/apiClient"
import { toDateString } from "@utils/format"
import {
  TrainerRequestConflictError,
  type ClientSummary,
  type TrainerRequest,
} from "../../types"

type Enveloped<T> = { data?: T }

const mapStatus = <T,>(status: number, toError: () => Error) => (error: unknown): T => {
  if (error instanceof ApiError && error.status === status) throw toError()
  throw error
}

const listRequests = async (url: string): Promise<TrainerRequest[]> => {
  const res = await apiCall<Enveloped<{ requests: TrainerRequest[] }>>(url)
  return res.data?.requests ?? []
}

export const trainerApi = {
  getClients: async (weekStart: Date): Promise<ClientSummary[]> => {
    // weekStart is the local day for servers that predate weekStartAt, which
    // carries the local Monday's real instant.
    const query = new URLSearchParams({
      weekStart: toDateString(weekStart),
      weekStartAt: weekStart.toISOString(),
    })
    const res = await apiCall<Enveloped<{ clients: ClientSummary[] }>>(
      `/api/trainer/clients?${query.toString()}`,
    )
    return res.data?.clients ?? []
  },

  sendRequest: async (
    target: { username: string } | { userId: string },
    includeTracking: boolean,
  ): Promise<void> => {
    const to = "username" in target ? { toUsername: target.username } : { toUserId: target.userId }
    await apiCall(`/api/trainer/requests`, {
      method: "POST",
      body: JSON.stringify({ ...to, includeTracking }),
    }).catch(mapStatus<never>(409, () => new TrainerRequestConflictError()))
  },

  getReceivedRequests: (): Promise<TrainerRequest[]> => listRequests(`/api/trainer/requests/received`),

  getSentRequests: (): Promise<TrainerRequest[]> => listRequests(`/api/trainer/requests/sent`),

  acceptRequest: async (id: string, includeTracking: boolean): Promise<void> => {
    await apiCall(`/api/trainer/requests/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: JSON.stringify({ includeTracking }),
    })
  },

  rejectRequest: async (id: string): Promise<void> => {
    await apiCall(`/api/trainer/requests/${encodeURIComponent(id)}/reject`, { method: "POST" })
  },

  cancelRequest: async (id: string): Promise<void> => {
    await apiCall(`/api/trainer/requests/${encodeURIComponent(id)}`, { method: "DELETE" })
  },

  removeClient: async (userId: string): Promise<void> => {
    await apiCall(`/api/trainer/clients/${encodeURIComponent(userId)}`, { method: "DELETE" })
  },
}
