export const FRIEND_QR_TYPE = "gymapp_friend_v1"

export interface FriendQrPayload {
  type: typeof FRIEND_QR_TYPE
  id: number | string
  username: string
}

export function buildFriendQrPayload(
  id: number | string,
  username: string,
): string {
  const payload: FriendQrPayload = { type: FRIEND_QR_TYPE, id, username }
  return JSON.stringify(payload)
}

const isValidUserId = (id: unknown): id is number | string =>
  (typeof id === "number" && Number.isInteger(id) && id > 0) ||
  (typeof id === "string" && id.trim().length > 0)

export function parseFriendQrPayload(raw: string): FriendQrPayload | null {
  try {
    const data = JSON.parse(raw)
    if (
      data?.type === FRIEND_QR_TYPE &&
      isValidUserId(data.id) &&
      typeof data.username === "string" &&
      data.username.trim().length > 0
    ) {
      return {
        type: FRIEND_QR_TYPE,
        id: data.id,
        username: data.username,
      }
    }
    return null
  } catch {
    return null
  }
}
