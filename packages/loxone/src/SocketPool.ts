import { IciSocket } from "@lox-nexus/ici"

/** One user's hold on a socket; release() once when done. */
export interface SocketLease {
  readonly socket: IciSocket
  /** closes the socket when this was its last user; calling it again does nothing */
  release(): Promise<void>
}

interface PoolEntry {
  socket: IciSocket
  ready: Promise<void>
  users: number
}

/**
 * Hands out one IciSocket per listen address and port, shared by every Miniserver that listens
 * there. Loxone Miniservers usually all send to the same port; every packet names its sender and
 * receiver, so each Miniserver's IciReceiver keeps only its own (see MiniserverManager for the
 * rule that keeps them apart). The socket is bound on first use and closed with its last user.
 *
 * Port 0 (an ephemeral port, used by tests) is never shared. A wildcard bind and a specific
 * address on the same port are different entries; the OS refuses the second (EADDRINUSE).
 */
export class SocketPool {
  private readonly entries = new Map<string, PoolEntry>()
  /** closes in progress per key; a new bind on that key waits for it, or it would see EADDRINUSE */
  private readonly closing = new Map<string, Promise<void>>()

  /**
   * @param address local IPv4 address; undefined means all interfaces
   * @throws whatever IciSocket.bind throws (EADDRINUSE, EADDRNOTAVAIL); nothing is held then
   */
  async acquire(port: number, address?: string): Promise<SocketLease> {
    if (port === 0) {
      const socket = new IciSocket()
      await socket.bind(0, address)
      return SocketPool.lease(socket, () => socket.close())
    }
    const key = `${address ?? "*"}:${port}`
    await this.closing.get(key)
    const entry = this.entries.get(key) ?? this.create(key, port, address)
    entry.users++
    try {
      await entry.ready
    } catch (error) {
      entry.users--
      throw error
    }
    return SocketPool.lease(entry.socket, () => this.release(key, entry))
  }

  // a failed bind removes the entry, so the next acquire tries again
  private create(key: string, port: number, address: string | undefined): PoolEntry {
    const socket = new IciSocket()
    const entry: PoolEntry = { socket, users: 0, ready: socket.bind(port, address) }
    this.entries.set(key, entry)
    entry.ready.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
    })
    return entry
  }

  private async release(key: string, entry: PoolEntry) {
    entry.users--
    if (entry.users > 0) return
    if (this.entries.get(key) === entry) this.entries.delete(key)
    const closed = entry.socket.close().finally(() => {
      if (this.closing.get(key) === closed) this.closing.delete(key)
    })
    this.closing.set(key, closed)
    await closed
  }

  private static lease(socket: IciSocket, close: () => Promise<void>): SocketLease {
    let released = false
    return {
      socket,
      release: async () => {
        if (released) return
        released = true
        await close()
      }
    }
  }
}
