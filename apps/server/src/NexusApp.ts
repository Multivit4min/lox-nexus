import { Disposable } from "@lox-nexus/plugin-sdk"

/**
 * Composition root: the only place where services are constructed and wired.
 * Services are added milestone by milestone (bus in M2, Loxone and HTTP in M3,
 * plugins in M4), see docs/architecture.md.
 */
export class NexusApp extends Disposable {
  async start() {
    console.log("lox-nexus: nothing to start yet (M0 skeleton)")
  }
}
