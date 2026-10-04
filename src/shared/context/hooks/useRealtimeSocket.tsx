// Single persistent WebSocket connection for the whole app. The JWT is sent as
// the first message after the socket opens, never as a URL query parameter,
// which would be written to server/proxy logs.

import { useEffect, useRef, useCallback, useState } from "react"
import { AppState } from "react-native"
import { assertSecureTransport, getServerUrl } from "../../services/config"
import {
  isServerless,
  onAppModeChange,
} from "../../services/appMode"
import { metric, log } from "../../services/crashReporting"
import { accessTokenExpiresAt } from "../../services/jwt"

const BASE_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000
// A server that's down permanently (or unreachable) would otherwise retry with
// exponential backoff forever. Give up after enough failures instead of
// reconnecting every 30s indefinitely. AppState going active resets the count.
const MAX_RETRY_ATTEMPTS = 10
// The TCP handshake proves nothing about the auth message the server has yet to
// validate. A socket it drops right away (1006/1008) must keep backing off, so
// the backoff is only reset once a connection has remained open this long.
const HEALTHY_AFTER_MS = 10_000
// A refused upgrade (429 too many sockets, 503 at capacity) carries a
// Retry-After that React Native's WebSocket never exposes. The status only
// shows up in the close reason, so back off at least this long.
const REFUSED_UPGRADE_RETRY_MS = 15_000
const REFUSED_UPGRADE = /\b(429|503)\b/

const isExpired = (token: string | null): boolean => {
  const expiresAt = token ? accessTokenExpiresAt(token) : null
  return expiresAt != null && expiresAt <= Date.now()
}

export interface WebSocketMessage {
  type: string
  [key: string]: unknown
}

export type SocketSubscriber = (msg: WebSocketMessage) => void

export interface RealtimeSocket {
  /** True when the message actually went out on an open socket. */
  send: (data: WebSocketMessage) => boolean
  connected: boolean
  /**
   * Registers a listener for inbound messages and returns its unsubscribe.
   * Deliberately not React state: this hook runs inside WorkoutProvider, so
   * storing each message would re-render the whole authenticated tree on every
   * frame of a live session. A subscription also cannot drop a message the way
   * one `lastMessage` slot does when two arrive in one render.
   */
  subscribe: (handler: SocketSubscriber) => () => void
  /**
   * True once the server has rejected the current token (e.g. expired or
   * malformed JWT). Remains true (and the socket remains disconnected) until
   * a *different* token is supplied. Surface this in the UI (e.g. to force
   * a re-login or token refresh) instead of silently retrying forever.
   */
  authError: boolean
  /**
   * True once reconnection attempts have been exhausted (MAX_RETRY_ATTEMPTS
   * failures in a row). Remains true until the app is foregrounded again or
   * the token changes, both of which trigger a fresh attempt.
   */
  connectionFailed: boolean
}

interface UseRealtimeSocketOptions {
  token: string | null
  /** The account the token belongs to. A change reopens the socket, a token refresh does not. */
  accountId?: string | number | null
  enabled?: boolean
  onMessage?: (msg: WebSocketMessage) => void
}

function wsUrl(): string {
  const base = getServerUrl().replace(/^http/, "ws")
  const url = `${base}/ws`
  assertSecureTransport(url)
  return url
}

export function useRealtimeSocket({
  token,
  accountId = null,
  enabled = true,
  onMessage,
}: UseRealtimeSocketOptions): RealtimeSocket {
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<number>(BASE_RETRY_MS)
  const retryCountRef = useRef<number>(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const healthyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef<((msg: WebSocketMessage) => void) | undefined>(
    onMessage,
  )
  // Keep a ref to the latest token so the auth message always uses a fresh value
  const tokenRef = useRef<string | null>(token)
  // Remembers the last token the server rejected with a 4000-4099 close
  // code. connect() refuses to open a new socket while tokenRef.current
  // still equals this value. It is cleared automatically once the token changes.
  const authFailedTokenRef = useRef<string | null>(null)
  // The server enforces the `exp` of the token it last accepted on this socket,
  // so a refresh is handed over in-band and only counts once acknowledged.
  const serverTokenRef = useRef<string | null>(null)
  const pendingRefreshRef = useRef<string | null>(null)
  // Mirrors isServerless() in a ref so the stable `connect` callback always
  // reads the current value instead of one captured at creation time.
  const offlineRef = useRef<boolean>(false)
  const subscribersRef = useRef<Set<SocketSubscriber>>(new Set())
  const [connected, setConnected] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [isOffline, setIsOffline] = useState<boolean>(true)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const subscribe = useCallback((handler: SocketSubscriber) => {
    subscribersRef.current.add(handler)
    return () => {
      subscribersRef.current.delete(handler)
    }
  }, [])

  useEffect(() => {
    tokenRef.current = token
    // A new (or newly-null) token deserves a fresh attempt, even if the
    // previous one was rejected.
    if (
      authFailedTokenRef.current !== null &&
      authFailedTokenRef.current !== token
    ) {
      authFailedTokenRef.current = null
      setAuthError(false)
    }
    retryCountRef.current = 0
    setConnectionFailed(false)
  }, [token])

  // Load the persisted app mode once, then stay in sync with it. Nothing
  // in this hook should attempt a socket connection until this resolves.
  useEffect(() => {
    void isServerless().then((offline) => {
      offlineRef.current = offline
      setIsOffline(offline)
    })
    return onAppModeChange.subscribe((mode) => {
      const offline = mode === "offline"
      offlineRef.current = offline
      setIsOffline(offline)
      if (offline) {
        console.debug("[WS_MODE_OFFLINE] Disconnecting realtime socket")
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        wsRef.current?.close(1000, "offline mode")
        wsRef.current = null
        setConnected(false)
      }
    })
  }, [])

  const connect = useCallback(() => {
    if (offlineRef.current) {
      console.debug("[WS_CONNECT_SKIP_OFFLINE]")
      return
    }
    if (!tokenRef.current || !enabled) {
      console.debug("[WS_CONNECT_SKIP]", { token: !!tokenRef.current, enabled })
      return
    }
    // CONNECTING counts: replacing a socket mid-handshake leaks it, and the
    // orphan keeps delivering messages to the same subscribers.
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      console.debug("[WS_ALREADY_OPEN]")
      return
    }
    if (
      authFailedTokenRef.current !== null &&
      authFailedTokenRef.current === tokenRef.current
    ) {
      // This exact token was already rejected by the server. Don't hammer
      // it. Wait for a new token (see the tokenRef sync effect above).
      console.debug("[WS_SKIP_KNOWN_BAD_TOKEN]")
      return
    }
    // After a long suspension the token has expired and AuthContext's refresh
    // is still in flight. Its new token reconnects through the token effect.
    if (isExpired(tokenRef.current)) {
      console.debug("[WS_SKIP_EXPIRED_TOKEN]")
      return
    }

    // Connect without the token in the URL. Send it as the first message
    // after the handshake completes so it never appears in access logs.
    let url: string
    try {
      url = wsUrl()
    } catch (error) {
      console.error("[WS_BAD_URL]", (error as Error).message)
      metric.count("ws.bad_url", 1)
      setConnectionFailed(true)
      return
    }
    console.debug("[WS_CONNECTING]", url)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.debug("[WS_CONNECTED] Sending auth message")
      // Authenticate immediately. The server should enforce a short timeout
      // and close the connection if this message is not received.
      ws.send(JSON.stringify({ type: "auth", token: tokenRef.current }))
      serverTokenRef.current = tokenRef.current
      pendingRefreshRef.current = null
      setConnected(true)
      metric.count("ws.connected", 1, {
        attributes: { reconnect: retryCountRef.current > 0 },
      })
      if (healthyTimerRef.current) clearTimeout(healthyTimerRef.current)
      healthyTimerRef.current = setTimeout(() => {
        retryRef.current = BASE_RETRY_MS
        retryCountRef.current = 0
        setConnectionFailed(false)
      }, HEALTHY_AFTER_MS)
    }

    ws.onmessage = (event: WebSocketMessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WebSocketMessage
        if (msg.type === "auth.refreshed" && pendingRefreshRef.current) {
          serverTokenRef.current = pendingRefreshRef.current
          pendingRefreshRef.current = null
          return
        }
        onMessageRef.current?.(msg)
        // Copied before iterating: a handler may unsubscribe itself.
        const handlers = [...subscribersRef.current]
        for (const handler of handlers) {
          try {
            handler(msg)
          } catch (e) {
            log.warn("ws.subscriber_error", { reason: (e as Error).message })
          }
        }
      } catch (e) {
        console.warn("[WS_PARSE_ERROR]", (e as Error).message)
        log.warn("ws.parse_error", { reason: (e as Error).message })
      }
    }

    ws.onerror = (e: Event) => {
      console.warn("[WS_ERROR]", (e as unknown as { message?: string }).message)
      metric.count("ws.error")
    }

    ws.onclose = (e: WebSocketCloseEvent) => {
      console.debug("[WS_CLOSED]", e.code, e.reason)
      // A superseded socket closing after a newer one opened must not tear
      // down the newer one's state, including its HEALTHY_AFTER_MS timer, which is
      // what resets the backoff.
      if (wsRef.current !== ws) return
      if (healthyTimerRef.current) clearTimeout(healthyTimerRef.current)
      setConnected(false)
      wsRef.current = null
      if (!enabled) return
      if (offlineRef.current) return
      // Every deliberate close here (unmount, backgrounding, offline mode)
      // uses 1000, and reconnecting would undo what the caller just asked for.
      if (e.code === 1000) return

      // Don't retry on auth failures or other client errors. Remember
      // this token so nothing else (AppState, effects) re-triggers a
      // pointless reconnect loop with the same bad token.
      if (e.code && e.code >= 4000 && e.code < 4100) {
        // Servers without `auth.refresh` still expire the socket on the token
        // it opened with, so a newer token in hand deserves a fresh handshake.
        if (serverTokenRef.current !== tokenRef.current) {
          metric.count("ws.reauth_after_expiry", 1)
          retryTimerRef.current = setTimeout(connect, 0)
          return
        }
        authFailedTokenRef.current = tokenRef.current
        // An expired token is waiting on a refresh, not a sign of a dead session.
        if (isExpired(tokenRef.current)) return
        setAuthError(true)
        console.warn("[WS_AUTH_FAILED]", e.code, e.reason)
        log.error("ws.auth_failed", { code: e.code })
        return
      }

      retryCountRef.current += 1
      if (retryCountRef.current > MAX_RETRY_ATTEMPTS) {
        console.warn(
          "[WS_GIVE_UP]",
          `after ${retryCountRef.current} failed attempts`,
        )
        log.error("ws.gave_up", { attempts: retryCountRef.current })
        setConnectionFailed(true)
        return
      }

      const refused = REFUSED_UPGRADE.test(e.reason ?? "")
      const delay = refused
        ? Math.max(retryRef.current, REFUSED_UPGRADE_RETRY_MS)
        : retryRef.current
      retryRef.current = Math.min(delay * 2, MAX_RETRY_MS)
      console.debug("[WS_RECONNECTING_IN]", delay, "ms")
      metric.count("ws.reconnect_scheduled", 1, {
        attributes: { attempt: retryCountRef.current, code: e.code ?? 0, refused },
      })
      retryTimerRef.current = setTimeout(connect, delay)
    }
  }, [enabled])

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    if (healthyTimerRef.current) clearTimeout(healthyTimerRef.current)
    wsRef.current?.close(1000, "unmount")
    wsRef.current = null
    setConnected(false)
  }, [])

  const send = useCallback(
    (data: WebSocketMessage) => {
      if (offlineRef.current) return false
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data))
        return true
      } else {
        metric.count("ws.send_failed", 1, {
          attributes: { dataType: data.type },
        })
        console.warn("[WS_SEND_FAILED]", {
          readyState: wsRef.current?.readyState,
          connected,
          dataType: data.type,
        })
        return false
      }
    },
    [connected],
  )

  // A refresh must not tear down a live socket (and the joint or watch session
  // riding on it), so the new token is handed over on the open one instead.
  const hasToken = !!token
  useEffect(() => {
    if (enabled && hasToken && !isOffline) {
      connect()
    } else {
      disconnect()
    }
    return disconnect
  }, [hasToken, accountId, enabled, isOffline, connect, disconnect])

  useEffect(() => {
    if (!token || !enabled || isOffline) return
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      if (serverTokenRef.current !== token && pendingRefreshRef.current !== token) {
        ws.send(JSON.stringify({ type: "auth.refresh", token }))
        pendingRefreshRef.current = token
      }
      return
    }
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryRef.current = BASE_RETRY_MS
    connect()
  }, [token, enabled, isOffline, connect])

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (offlineRef.current) return
      if (state === "active") {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryRef.current = BASE_RETRY_MS
          retryCountRef.current = 0
          setConnectionFailed(false)
          connect()
        }
      } else {
        // A retry scheduled before backgrounding would otherwise fire and open
        // a socket the app just asked to close.
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
        wsRef.current?.close(1000, "background")
        wsRef.current = null
        setConnected(false)
      }
    })
    return () => sub.remove()
  }, [connect])

  return { send, connected, subscribe, authError, connectionFailed }
}
