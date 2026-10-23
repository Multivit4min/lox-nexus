import dgram, { type RemoteInfo, type Socket } from "node:dgram"
import { EventEmitter } from "node:events"
import type { AddressInfo } from "node:net"

/** Anything that can send a datagram; lets RemotePeer be tested without a socket. */
export interface DatagramSender {
  send(buffer: Buffer, port: number, host: string): Promise<void>
}

export interface SocketEvents {
  datagram: [buffer: Buffer, from: RemoteInfo]
  /** runtime socket errors; deliberately not called "error" so a missing listener can't crash the process */
  socketError: [error: Error]
}

/**
 * A UDP socket that can be bound, closed and bound again. bind() rejects instead of emitting
 * an unhandled "error", and sending on a closed socket rejects instead of throwing.
 */
export class IciSocket extends EventEmitter<SocketEvents> implements DatagramSender {
  private socket: Socket | undefined

  get isOpen() {
    return this.socket !== undefined
  }

  address(): AddressInfo | undefined {
    return this.socket?.address()
  }

  async bind(port: number, address?: string) {
    if (this.socket) throw new Error("IciSocket is already bound")
    const socket = dgram.createSocket("udp4")
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject)
        socket.bind(port, address, () => {
          socket.off("error", reject)
          resolve()
        })
      })
    } catch (error) {
      IciSocket.closeQuietly(socket)
      throw error
    }
    socket.on("message", (buffer, from) => this.emit("datagram", buffer, from))
    socket.on("error", error => this.emit("socketError", error))
    this.socket = socket
  }

  send(buffer: Buffer, port: number, host: string): Promise<void> {
    const socket = this.socket
    if (!socket) return Promise.reject(new Error("IciSocket is not open"))
    return new Promise((resolve, reject) => {
      socket.send(buffer, port, host, error => (error ? reject(error) : resolve()))
    })
  }

  async close() {
    const socket = this.socket
    if (!socket) return
    this.socket = undefined
    await new Promise<void>(resolve => socket.close(() => resolve()))
  }

  private static closeQuietly(socket: Socket) {
    try {
      socket.close()
    } catch {
      // a socket whose bind failed may already be closed
    }
  }
}
