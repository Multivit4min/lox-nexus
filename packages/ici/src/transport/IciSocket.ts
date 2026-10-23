import dgram, { type RemoteInfo, type Socket } from "node:dgram"
import { EventEmitter } from "node:events"
import type { AddressInfo } from "node:net"

/** Anything that can send a datagram; lets RemotePeer be tested without a socket. */
export interface DatagramSender {
  send(buffer: Buffer, port: number, host: string): Promise<void>
}

/** Events of IciSocket. */
export interface SocketEvents {
  /** every received datagram; the buffer is only valid for the duration of the handler unless copied */
  datagram: [buffer: Buffer, from: RemoteInfo]
  /** runtime socket errors; deliberately not called "error" so a missing listener can't crash the process */
  socketError: [error: Error]
}

/**
 * A UDP socket that can be bound, closed and bound again.
 *
 * - bind() rejects instead of emitting an unhandled "error", and refuses while bound or binding
 * - close() during a pending bind cancels it; the bind rejects and leaves nothing open
 * - sends still in flight when close() runs are rejected, because dgram drops their callbacks
 */
export class IciSocket extends EventEmitter<SocketEvents> implements DatagramSender {
  private socket: Socket | undefined
  private binding: Socket | undefined
  private readonly pendingSends = new Set<(error: Error) => void>()

  /** true once bind() has completed and until close() */
  get isOpen() {
    return this.socket !== undefined
  }

  /** the bound address, which reveals the real port after binding port 0 (used by tests) */
  address(): AddressInfo | undefined {
    return this.socket?.address()
  }

  /**
   * Binds a UDP4 socket; port 0 picks a free one.
   * @param address interface to bind to, default all interfaces
   * @throws Error if already bound or binding, if the port is in use, or if close() ran meanwhile
   */
  async bind(port: number, address?: string) {
    if (this.socket || this.binding) throw new Error("IciSocket is already bound or binding")
    const socket = dgram.createSocket("udp4")
    this.binding = socket
    try {
      await IciSocket.bindSocket(socket, port, address)
    } catch (error) {
      if (this.binding === socket) this.binding = undefined
      IciSocket.closeQuietly(socket)
      throw error
    }
    if (this.binding !== socket) {
      IciSocket.closeQuietly(socket)
      throw new Error("IciSocket was closed while binding")
    }
    this.binding = undefined
    socket.on("message", (buffer, from) => this.emit("datagram", buffer, from))
    socket.on("error", error => this.emit("socketError", error))
    this.socket = socket
  }

  /** Resolves when the OS has accepted the datagram (UDP gives no delivery guarantee). Rejects if the socket is not open or closes mid-send. */
  send(buffer: Buffer, port: number, host: string): Promise<void> {
    const socket = this.socket
    if (!socket) return Promise.reject(new Error("IciSocket is not open"))
    return new Promise((resolve, reject) => {
      this.pendingSends.add(reject)
      try {
        socket.send(buffer, port, host, error => {
          this.pendingSends.delete(reject)
          if (error) reject(error)
          else resolve()
        })
      } catch (error) {
        this.pendingSends.delete(reject)
        reject(error)
      }
    })
  }

  /** Idempotent. Pending sends are rejected first; afterwards the socket may be bound again. */
  async close() {
    this.binding = undefined
    const socket = this.socket
    if (!socket) return
    this.socket = undefined
    const closed = new Error("IciSocket closed while sending")
    for (const reject of this.pendingSends) reject(closed)
    this.pendingSends.clear()
    await new Promise<void>(resolve => socket.close(() => resolve()))
  }

  private static bindSocket(socket: Socket, port: number, address?: string) {
    return new Promise<void>((resolve, reject) => {
      socket.once("error", reject)
      socket.bind(port, address, () => {
        socket.off("error", reject)
        resolve()
      })
    })
  }

  private static closeQuietly(socket: Socket) {
    try {
      socket.close()
    } catch {
      // a socket whose bind failed may already be closed
    }
  }
}
