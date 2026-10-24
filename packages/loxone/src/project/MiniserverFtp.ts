import { Writable } from "node:stream"
import { Client, FTPError } from "basic-ftp"
import { ProjectFiles } from "./ProjectFiles.ts"
import { ProjectReadError } from "./ProjectReadError.ts"

/** A Miniserver user allowed to use FTP (Loxone Config: user rights "FTP"). */
export interface FtpCredentials {
  username: string
  password: string
}

/** The newest project file from a Miniserver, as downloaded. */
export interface DownloadedProject {
  name: string
  data: Buffer
}

/** idle timeout per socket, overall deadline for the whole read, FTP port */
export interface FtpTimings {
  timeoutMs: number
  deadlineMs: number
  port: number
}

/**
 * Fetches the current Loxone Config project from a Miniserver's `/prog` folder over FTP. Plain
 * FTP is all the Miniserver offers, so the login travels unencrypted on the LAN; it is used for
 * this one download and not kept.
 */
export class MiniserverFtp {
  static readonly FOLDER = "/prog"
  /** projects are a few MB; this bounds what a misbehaving server can make us buffer */
  static readonly MAX_BYTES = 32 * 1024 * 1024
  private readonly timings: FtpTimings

  constructor(timings: Partial<FtpTimings> = {}) {
    this.timings = { timeoutMs: 15_000, deadlineMs: 60_000, port: 21, ...timings }
  }

  /** @throws ProjectReadError for anything that goes wrong on the Miniserver's side, with a message for the user */
  async download(host: string, credentials: FtpCredentials): Promise<DownloadedProject> {
    const client = new Client(this.timings.timeoutMs)
    let late = false
    // the socket timeout only catches silence; a server that trickles data is stopped here
    const deadline = setTimeout(() => {
      late = true
      client.close()
    }, this.timings.deadlineMs)
    try {
      return await this.fetch(client, host, credentials)
    } catch (error) {
      if (late) throw new ProjectReadError(`reading the project from ${host} took longer than ${this.timings.deadlineMs / 1000} s`)
      throw MiniserverFtp.explain(error, host)
    } finally {
      clearTimeout(deadline)
      client.close()
    }
  }

  private async fetch(client: Client, host: string, credentials: FtpCredentials): Promise<DownloadedProject> {
    await client.access({ host, port: this.timings.port, user: credentials.username, password: credentials.password, secure: false })
    const files = (await client.list(MiniserverFtp.FOLDER)).filter(file => file.isFile)
    const name = ProjectFiles.newest(files.map(file => file.name))
    if (!name) throw new ProjectReadError(`no project file in ${MiniserverFtp.FOLDER} on the Miniserver`)
    const chunks: Buffer[] = []
    await client.downloadTo(MiniserverFtp.sink(chunks), `${MiniserverFtp.FOLDER}/${name}`)
    return { name, data: Buffer.concat(chunks) }
  }

  // collects the download, failing it once it grows past MAX_BYTES
  private static sink(chunks: Buffer[]) {
    let size = 0
    return new Writable({
      write(chunk: Buffer, _encoding, done) {
        size += chunk.length
        if (size > MiniserverFtp.MAX_BYTES) return done(new ProjectReadError("the project file is larger than expected"))
        chunks.push(chunk)
        done()
      }
    })
  }

  // basic-ftp reports most server misbehaviour as plain Errors; only our own bugs stay unexplained
  private static explain(error: unknown, host: string): Error {
    if (error instanceof ProjectReadError || error instanceof TypeError || error instanceof RangeError) return error
    if (error instanceof FTPError && error.code === 530) {
      return new ProjectReadError("the Miniserver refused the FTP login; check the user, its password and its FTP right. "
        + "Repeated failed logins make the Miniserver block this server's address for a while.")
    }
    if (error instanceof FTPError) return new ProjectReadError(`the Miniserver's FTP server answered: ${error.message}`)
    const code = error instanceof Error && "code" in error ? error.code : undefined
    if (code === "ECONNREFUSED") return new ProjectReadError(`${host} refuses FTP connections; is FTP enabled on the Miniserver?`)
    if (typeof code === "string") return new ProjectReadError(`can't reach ${host} over FTP (${code})`)
    const message = error instanceof Error ? error.message : String(error)
    if (/timeout/i.test(message)) return new ProjectReadError(`${host} did not answer over FTP in time`)
    return new ProjectReadError(`the FTP session with ${host} failed: ${message}`)
  }
}
