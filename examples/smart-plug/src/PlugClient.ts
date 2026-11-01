import { z } from "@lox-nexus/plugin-sdk"

/** What the plug answers to GET /status and POST /switch. */
const plugStatus = z.object({
  name: z.string(),
  on: z.boolean(),
  /** W */
  power: z.number(),
  /** kWh since it was plugged in */
  energy: z.number()
})

export type PlugStatus = z.infer<typeof plugStatus>

/**
 * Talks to the plug's HTTP API. Its errors are what the user reads (in the connection test and as
 * the instance's status), so they say what went wrong in words, not as a stack trace.
 */
export class PlugClient {
  /** a plug on the LAN answers in milliseconds; one that takes longer is as good as gone */
  static readonly TIMEOUT_MS = 5000

  constructor(private readonly address: string) {}

  status() {
    return this.request("GET", "/status")
  }

  switch(on: boolean) {
    return this.request("POST", "/switch", { on })
  }

  private async request(method: string, path: string, body?: unknown): Promise<PlugStatus> {
    const response = await fetch(new URL(path, this.address), {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(PlugClient.TIMEOUT_MS)
    }).catch((error: unknown) => {
      throw new Error(`can't reach the plug at ${this.address}: ${PlugClient.reason(error)}`)
    })
    if (!response.ok) throw new Error(`the plug answered ${response.status} ${response.statusText}`)
    // checked, not cast: another device at that address, or a firmware that changed its answer,
    // gets a message the user can act on instead of wrong values further down
    const parsed = plugStatus.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw new Error(`the plug at ${this.address} answered something unexpected; is it the right address?`)
    return parsed.data
  }

  // fetch hides the useful part ("connection refused") in the error's cause
  private static reason(error: unknown) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    if (cause instanceof Error && cause.name === "TimeoutError") return "no answer"
    return cause instanceof Error ? cause.message : String(cause)
  }
}
