import { StreamCloseCode, type StreamEvent, type StreamRequest } from "@lox-nexus/api"

export type StreamState = "connecting" | "open" | "closed"

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void
  onState?: (state: StreamState) => void
  /** the server ended the session (logout elsewhere, password change, expiry) */
  onSessionEnded?: () => void
}

/**
 * The /api/stream WebSocket with automatic reconnect (1 s doubling to 30 s). Subscriptions are
 * remembered and sent again after every reconnect, so callers subscribe once. When the server
 * closes with SESSION_ENDED it does not reconnect but calls `onSessionEnded`.
 */
export class StreamConnection {
  private static readonly MAX_DELAY_MS = 30_000
  private socket: WebSocket | undefined
  private delay = 1000
  private retry: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private readonly subscriptions = new Map<"bus" | "state", StreamRequest>()

  constructor(private readonly handlers: StreamHandlers) {}

  open() {
    this.closed = false
    this.connect()
  }

  /** replaces any earlier subscription of the same stream */
  subscribe(stream: "bus" | "state", pattern: string) {
    const request: StreamRequest = { type: "subscribe", stream, pattern }
    this.subscriptions.set(stream, request)
    this.send(request)
  }

  unsubscribe(stream: "bus" | "state") {
    this.subscriptions.delete(stream)
    this.send({ type: "unsubscribe", stream })
  }

  close() {
    this.closed = true
    clearTimeout(this.retry)
    this.socket?.close()
    this.socket = undefined
    this.handlers.onState?.("closed")
  }

  private connect() {
    const url = new URL("/api/stream", location.href)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(url)
    this.socket = socket
    this.handlers.onState?.("connecting")
    socket.onopen = () => {
      this.delay = 1000
      this.handlers.onState?.("open")
      for (const request of this.subscriptions.values()) this.send(request)
    }
    socket.onmessage = message => this.handlers.onEvent(JSON.parse(String(message.data)) as StreamEvent)
    socket.onclose = event => {
      if (event.code === StreamCloseCode.SESSION_ENDED) {
        this.close()
        return this.handlers.onSessionEnded?.()
      }
      this.reconnect(socket)
    }
  }

  private reconnect(socket: WebSocket) {
    if (this.closed || socket !== this.socket) return
    this.handlers.onState?.("closed")
    this.retry = setTimeout(() => this.connect(), this.delay)
    this.delay = Math.min(this.delay * 2, StreamConnection.MAX_DELAY_MS)
  }

  private send(request: StreamRequest) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(request))
  }
}
