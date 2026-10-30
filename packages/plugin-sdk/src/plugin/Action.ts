import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { Plugin } from "./Plugin.ts"

/**
 * Something a user starts from the instance page, with a small form: pair a device, open a pairing
 * window, remove a paired controller. One class per action, declared in the plugin's static
 * `actions`; only `id` and `run()` are required:
 *
 * ```ts
 * export class PairAction extends Action<MatterPlugin, { code: string }> {
 *   static readonly id = "pair"
 *   static readonly label = "Pair device"
 *   static readonly input = z.object({ code: z.string().regex(/^\d{11}$/) })
 *   async run() {
 *     const node = await this.plugin.controller.pair(this.input.code)
 *     return `Paired ${node.name}`
 *   }
 * }
 * ```
 *
 * The runtime validates the input against `input`, builds the action, runs it and disposes it when
 * `run()` settles or the plugin stops. One action runs at a time per instance. What `run()`
 * returns is shown to the user (at most 2000 characters) and not logged; what it throws is shown as
 * the failure and also written to the instance log, so keep codes out of error messages. Inputs
 * may hold secrets such as pairing codes: don't log them.
 */
export abstract class Action<P extends Plugin = Plugin, Input = unknown> extends Disposable {
  /** `input` is validated against the static `input` schema, with defaults applied */
  constructor(readonly plugin: P, readonly input: Input) {
    super()
    this.useClock(plugin?.clock)
  }

  /** does the work; the returned text tells the user what happened */
  abstract run(): string | void | Promise<string | void>
}

/** The static side of an action class. */
export type ActionClass = (new (plugin: never, input: never) => Action<Plugin, unknown>) & {
  /** unique within the plugin; the API addresses the action by it */
  readonly id: string
  /** the button's text; default: the id */
  readonly label?: string
  /** one sentence shown in the action's dialog */
  readonly description?: string
  /** the form's schema; default: no input (an empty object) */
  readonly input?: z.ZodType
  /** a sentence the user confirms before it runs, for actions that undo something */
  readonly confirm?: string
  /**
   * where its button is: "toolbar" (default) at the top of the instance page, or "panel" only
   * where the panel puts it, as a section's button (`actions`) or a table row's (`rowActions`)
   */
  readonly placement?: "toolbar" | "panel"
}
