export interface Message {
  id: number
  fromMe: boolean
  body: string
  createdAt: string
  readAt: string | null
  editedAt?: string | null
}

export interface Peer {
  userUuid: string
  username: string
}

/** How the other person relates to the reader: their trainer, their client, or neither. */
export type Relation = "trainer" | "client" | null

export interface Conversation {
  userUuid: string
  username: string
  lastMessage: { body: string; createdAt: string; fromMe: boolean }
  unreadCount: number
  relation: Relation
}

export interface Thread {
  messages: Message[]
  canSend: boolean
}

/** The `message_new` WS payload. */
export interface IncomingMessage {
  fromUuid: string
  fromUsername: string
  message: Message
}
