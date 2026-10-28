import { apiCall } from "@shared/services/apiClient"
import type { SealedMessage } from "../../utils/trackingCrypto"

type Enveloped<T> = { data?: T }

export interface RecipientKey {
  keyId: number
  publicKey: string
  resend: boolean
}

export interface Recipient {
  trainerId: string
  keys: RecipientKey[]
}

export interface RelayMessage extends SealedMessage {
  id: string
  clientId: string
  kind: "snapshot" | "photo"
  ref: string
  createdAt: string
}

const BASE = "/api/sharing/tracking"
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) })

export const trackingRelayApi = {
  registerDeviceKey: async (deviceId: string, publicKey: string): Promise<number> => {
    const res = await apiCall<Enveloped<{ keyId: number }>>(`${BASE}/devices/key`, {
      method: "PUT",
      body: JSON.stringify({ deviceId, publicKey }),
    })
    return res.data!.keyId
  },

  getRecipients: async (): Promise<Recipient[]> => {
    const res = await apiCall<Enveloped<{ recipients: Recipient[] }>>(`${BASE}/recipients`)
    return res.data?.recipients ?? []
  },

  sendMessage: async (
    keyId: number,
    kind: "snapshot" | "photo",
    ref: string,
    sealed: SealedMessage,
  ): Promise<void> => {
    await apiCall(`${BASE}/messages`, post({ keyId, kind, ref, ...sealed }))
  },

  getMessages: async (deviceId: string): Promise<RelayMessage[]> => {
    const res = await apiCall<Enveloped<{ messages: RelayMessage[] }>>(
      `${BASE}/messages?${new URLSearchParams({ deviceId }).toString()}`,
    )
    return res.data?.messages ?? []
  },

  ackMessages: async (deviceId: string, ids: string[]): Promise<void> => {
    await apiCall(`${BASE}/messages/ack`, post({ deviceId, ids }))
  },

  requestResend: async (deviceId: string, clientId: string): Promise<void> => {
    await apiCall(`${BASE}/resend-requests`, post({ deviceId, clientId }))
  },
}
