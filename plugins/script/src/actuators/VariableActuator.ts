import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { ScriptPlugin } from "../ScriptPlugin.ts"
import { variableParams, type VariableParams } from "../VariableParams.ts"

/**
 * A value for the script: stored for `nexus.get(name)` and passed to every `nexus.on(name, …)`
 * handler. The command waits for all handlers, so its result fails with the script's message when
 * one throws or rejects.
 *
 * Commands queue (the SDK default) rather than keep only the latest: a handler then sees every
 * value in order, which matters for scripts that count pulses or react to each change. A handler
 * that never settles holds the queue, so handlers should not wait without a limit.
 */
export abstract class VariableActuator<V extends Value> extends Actuator<ScriptPlugin, VariableParams, V> {
  static readonly params = variableParams
  static readonly concurrency = "queue"

  override start() {
    this.onDispose(this.plugin.inbox.attach(this.params.name))
  }

  run(value: V) {
    return this.plugin.inbox.receive(this.params.name, value)
  }
}
