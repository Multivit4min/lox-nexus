import type { Duplex } from "node:stream"
import tls from "node:tls"
import { CertificateFingerprint } from "../config/CertificateFingerprint.ts"
import type { ConsoleAddress } from "../config/ConsoleAddress.ts"

/** "verify": the usual chain and name check; "pin": only this certificate; "any": no check */
export type TlsMode = { kind: "verify" } | { kind: "pin"; fingerprint: CertificateFingerprint } | { kind: "any" }

/** hands the verified socket to the HTTP request, or the reason there is none (the socket is then destroyed) */
export type ConnectDone = (error: Error | null, socket: Duplex) => void

/**
 * Opens the TLS connection for one request and decides whether the console's certificate is
 * acceptable before the request (and with it the API key) is written to the socket. The decision
 * applies to this plugin's own connections only; nothing process-wide changes.
 *
 * Node checks the chain and the name in every mode (`rejectUnauthorized: false` only keeps the
 * socket open); this class then judges `authorized` or the pinned fingerprint itself, so a refusal
 * can name the fingerprint the console presented.
 */
export class TlsPolicy {
  constructor(readonly mode: TlsMode) {}

  /** the mode the config asks for; a pinned fingerprint wins over "accept any" */
  static fromConfig(config: { fingerprint?: string | undefined; acceptAnyCertificate: boolean }) {
    if (config.fingerprint) return new TlsPolicy({ kind: "pin", fingerprint: CertificateFingerprint.parse(config.fingerprint) })
    return new TlsPolicy(config.acceptAnyCertificate ? { kind: "any" } : { kind: "verify" })
  }

  /** for the panel */
  describe() {
    if (this.mode.kind === "pin") return `pinned (SHA-256 ${this.mode.fingerprint})`
    return this.mode.kind === "any" ? "any certificate accepted (insecure)" : "verified against trusted CAs"
  }

  /** connects; `done` gets the socket only once the certificate passed */
  connect(address: ConsoleAddress, signal: AbortSignal, done: ConnectDone) {
    const socket = tls.connect({
      host: address.host,
      port: address.port,
      servername: address.serverName,
      rejectUnauthorized: false,
      ALPNProtocols: ["http/1.1"]
    })
    const settle = (error: Error | null) => {
      socket.off("error", settle)
      signal.removeEventListener("abort", aborted)
      if (error) socket.destroy()
      done(error, socket)
    }
    const aborted = () => settle(signal.reason instanceof Error ? signal.reason : new Error("aborted"))
    socket.once("secureConnect", () => settle(this.judge(socket)))
    socket.once("error", settle)
    if (signal.aborted) aborted()
    else signal.addEventListener("abort", aborted, { once: true })
  }

  /** the reason to refuse this socket's certificate, or null */
  private judge(socket: tls.TLSSocket): Error | null {
    const presented = socket.getPeerCertificate().fingerprint256 ?? ""
    if (this.mode.kind === "any") return null
    if (this.mode.kind === "pin") {
      if (this.mode.fingerprint.matches(presented)) return null
      return new Error(`the console's certificate doesn't match the pinned fingerprint; it presented SHA-256 ${presented || "none"}`)
    }
    if (socket.authorized) return null
    return new Error(`the console's certificate isn't trusted (${String(socket.authorizationError)}); ` +
      `it presented SHA-256 ${presented || "none"}. Check it on the console and pin it as the certificate fingerprint`)
  }
}
