/**
 * Why a connection failed, in words for the user, and whether retrying can help. A refused login
 * or an invalid certificate is `fatal`: at start it puts the instance into the error state, later
 * it is retried slowly (the broker's users may be changed back).
 */
export class ConnectFailure {
  private static readonly refusals: ReadonlyMap<number, [string, boolean]> = new Map([
    [1, ["the broker doesn't accept MQTT 3.1.1", true]],
    [2, ["the broker refused the client ID (some brokers allow only 23 characters: set a shorter one)", true]],
    [3, ["the broker is unavailable", false]],
    [4, ["the broker refused the login: wrong user or password", true]],
    [5, ["the broker refused the login: not authorized", true]],
    [128, ["the broker refused the connection", false]],
    [133, ["the broker refused the client ID", true]],
    [134, ["the broker refused the login: wrong user or password", true]],
    [135, ["the broker refused the login: not authorized", true]],
    [136, ["the broker is unavailable", false]],
    [137, ["the broker is busy", false]],
    [138, ["the broker has banned this client", true]]
  ])

  private static readonly network: ReadonlyMap<string, string> = new Map([
    ["ECONNREFUSED", "connection refused: is the broker running on that host and port?"],
    ["ENOTFOUND", "host not found"],
    ["EAI_AGAIN", "host not found (DNS not answering)"],
    ["ETIMEDOUT", "connection timed out"],
    ["EHOSTUNREACH", "host unreachable"],
    ["ENETUNREACH", "network unreachable"],
    ["ECONNRESET", "the broker closed the connection"],
    ["EPIPE", "the broker closed the connection"],
    ["ERR_SSL_WRONG_VERSION_NUMBER", "the port doesn't speak TLS: use mqtt:// for a plain port, or the broker's TLS port"]
  ])

  private static readonly certificate = new Set([
    "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID"
  ])

  private constructor(readonly message: string, readonly fatal: boolean) {}

  static of(error: unknown): ConnectFailure {
    const code = (error as { code?: unknown } | undefined)?.code
    const message = error instanceof Error ? error.message : String(error)
    if (typeof code === "number") {
      const [words, fatal] = ConnectFailure.refusals.get(code) ?? [`the broker refused the connection (code ${code})`, false]
      return new ConnectFailure(words, fatal)
    }
    if (typeof code === "string" && ConnectFailure.certificate.has(code)) {
      return new ConnectFailure(`the broker's TLS certificate isn't valid (${code}); for a self-signed one turn off "Check TLS certificate"`, true)
    }
    if (typeof code === "string") return new ConnectFailure(ConnectFailure.network.get(code) ?? `${message} (${code})`, false)
    if (message === "connack timeout") return new ConnectFailure("the broker didn't answer the connection request", false)
    if (/Unexpected server response: 404/.test(message)) return new ConnectFailure("no WebSocket endpoint at that path: check the path in the URL (often /mqtt)", false)
    return new ConnectFailure(message, false)
  }

  static closed() {
    return new ConnectFailure("the connection was closed", false)
  }
}
