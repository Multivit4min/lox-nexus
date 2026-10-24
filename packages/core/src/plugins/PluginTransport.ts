import type { Listenable } from "@lox-nexus/plugin-sdk"
import type { HostMessage, WorkerMessage } from "@lox-nexus/plugin-sdk/wire"

/** Events of a connection to one running plugin. */
export interface PluginConnectionEvents {
  /** a validated message from the plugin */
  message: [message: WorkerMessage]
  /** the plugin sent something that isn't a valid message; the session treats it as broken */
  invalid: [reason: string]
  /** a line the plugin wrote to stdout or stderr */
  output: [stream: "stdout" | "stderr", line: string]
  /** the plugin is gone: it exited, crashed or ran out of memory */
  exit: [reason: string]
}

/** One running plugin, however it is isolated (a worker thread today, a process later). */
export interface PluginConnection extends Listenable {
  send(message: HostMessage): void
  /** ends it at once, e.g. after the shutdown grace period; resolves once it is gone */
  terminate(): Promise<void>
}

/** Starts plugins. The seam that keeps a later switch to child processes open (ADR 0001). */
export interface PluginTransport {
  /** @param entry absolute path or file URL of the module that calls PluginEntry.define() */
  open(entry: string): PluginConnection
}
