import { createOnlineOnlyProxy } from "@shared/services/dispatchProxy"
import { messagesApi as messagesApiOn } from "./on/messages"

// Messages are relayed by the server, so offline mode hides the feature rather than keeping a local copy.
export const messagesApi = createOnlineOnlyProxy(messagesApiOn, "messages")
