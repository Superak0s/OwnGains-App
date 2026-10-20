import { createEmitter } from "@utils/emitter"
import type { Message } from "./types"

/** Socket events for the open thread, so it updates without refetching. */
export const threadEvents = createEmitter<
  | { type: "new"; fromUuid: string; message: Message }
  | { type: "edited"; fromUuid: string; message: Message }
  | { type: "deleted"; fromUuid: string; messageId: number }
  | { type: "read"; byUuid: string; readAt: string }
>()
