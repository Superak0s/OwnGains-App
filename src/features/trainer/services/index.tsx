import { createOnlineOnlyProxy } from "@shared/services/dispatchProxy"
import { trainerApi as trainerApiOn } from "./on/trainer"
import { trackingRelayApi as trackingRelayApiOn } from "./on/trackingRelay"

// Coaching is server-mediated, so there is no off/ twin.
export const trainerApi = createOnlineOnlyProxy(trainerApiOn, "trainer")
export const trackingRelayApi = createOnlineOnlyProxy(trackingRelayApiOn, "tracking_relay")

export type { ClientSummary, TrainerRequest } from "../types"
export type { Recipient, RelayMessage } from "./on/trackingRelay"
export { TrainerRequestConflictError } from "../types"
