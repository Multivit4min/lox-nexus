import { once } from "node:events"
import { createServer, type AddressInfo, type Server, type Socket } from "node:net"

/** How the fake answers; files are served from `/prog`. */
export interface FakeFtpBehaviour {
  files?: Record<string, Uint8Array>
  /** answer PASS with 530 */
  refuseLogin?: boolean
  /** close the control connection instead of answering this command */
  hangUpOn?: string
}

/**
 * Just enough of an FTP server on 127.0.0.1 for MiniserverFtp: login, EPSV, LIST and RETR. Every
 * other command is acknowledged with 200, like a server that accepts basic-ftp's setup commands.
 */
export class FakeFtpServer {
  private readonly server: Server
  private readonly sockets = new Set<Socket>()
  private data: Promise<Socket> | undefined

  constructor(private readonly behaviour: FakeFtpBehaviour = {}) {
    this.server = createServer(socket => this.session(socket))
  }

  async listen(): Promise<number> {
    this.server.listen(0, "127.0.0.1")
    await once(this.server, "listening")
    return (this.server.address() as AddressInfo).port
  }

  async close() {
    for (const socket of this.sockets) socket.destroy()
    this.server.close()
    await once(this.server, "close")
  }

  private session(control: Socket) {
    this.sockets.add(control)
    control.on("close", () => this.sockets.delete(control))
    control.write("220 fake Miniserver\r\n")
    let buffered = ""
    control.on("data", chunk => {
      buffered += chunk.toString("utf8")
      for (let end = buffered.indexOf("\r\n"); end >= 0; end = buffered.indexOf("\r\n")) {
        const line = buffered.slice(0, end)
        buffered = buffered.slice(end + 2)
        void this.command(control, line)
      }
    })
  }

  private async command(control: Socket, line: string) {
    const [verb = "", ...rest] = line.split(" ")
    const arg = rest.join(" ")
    if (verb === this.behaviour.hangUpOn) return void control.destroy()
    if (verb === "USER") return void control.write("331 password please\r\n")
    if (verb === "PASS") return void control.write(this.behaviour.refuseLogin ? "530 Login incorrect\r\n" : "230 logged in\r\n")
    if (verb === "FEAT") return void control.write("211 no features\r\n")
    if (verb === "EPSV") return void control.write(`229 Entering Extended Passive Mode (|||${await this.passive()}|)\r\n`)
    if (verb === "LIST") return this.transfer(control, Buffer.from(this.listing()))
    if (verb === "RETR") {
      const file = this.behaviour.files?.[arg.replace(/^\/prog\//, "")]
      return file ? this.transfer(control, file) : void control.write("550 no such file\r\n")
    }
    control.write("200 OK\r\n")
  }

  private listing() {
    return Object.entries(this.behaviour.files ?? {})
      .map(([name, data]) => `-rw-rw-rw-    1 1000       1000 ${String(data.length).padStart(12)} Oct 24 12:27 ${name}\r\n`)
      .join("")
  }

  // one data connection per transfer, on a fresh port
  private async passive(): Promise<number> {
    const server = createServer()
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    this.data = once(server, "connection").then(([socket]) => {
      server.close()
      this.sockets.add(socket as Socket)
      return socket as Socket
    })
    return (server.address() as AddressInfo).port
  }

  private async transfer(control: Socket, payload: Uint8Array) {
    const socket = await this.data!
    control.write("150 sending\r\n")
    socket.end(payload)
    await once(socket, "close")
    control.write("226 done\r\n")
  }
}
