import { createOnlineOnlyProxy } from "@shared/services/dispatchProxy"
import { friendsApi as friendsApiOn } from "./on/friends"
import { sharingApi as sharingApiOn } from "./on/sharing"

// Friend requests, sharing and search are server-mediated by nature, so there
// is no off/ twin, but offline mode must still not reach the network.
export const friendsApi = createOnlineOnlyProxy(friendsApiOn, "friends")
export const sharingApi = createOnlineOnlyProxy(sharingApiOn, "sharing")

export { buildFriendQrPayload, parseFriendQrPayload } from "./qrFriendCode"

export { REPORT_REASONS } from "../types"

export type {
  Friend,
  BlockedUser,
  ReportReason,
  ReceivedProgram,
  PendingFriendRequest,
  SentFriendRequest,
  UserSearchResult,
  PermissionType,
  FriendId,
  GrantedPermission,
  ReceivedPermission,
  JointInviteParams,
} from "../types"
