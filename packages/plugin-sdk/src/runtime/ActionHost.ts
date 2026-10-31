import { z } from "zod"
import type { Action, ActionClass } from "../plugin/Action.ts"
import type { Plugin, PluginClass } from "../plugin/Plugin.ts"
import { type ActionAnswer, PanelPartSchema } from "../wire/PanelShapes.ts"
import { ActionProgress } from "./ActionProgress.ts"
import { Declarations } from "./Declarations.ts"
import type { ProgressSender } from "./ProgressSender.ts"

/**
 * Runs the plugin's actions, one at a time: a second one is refused while one runs, also after the
 * host stopped waiting for it, so a slow pairing can't be started twice. A failing teardown is
 * logged, never reported as the action's outcome, and never stops the plugin from stopping.
 */
export class ActionHost {
  /** the longest text an action's answer may have; longer ones are clipped */
  static readonly MAX_RESULT = 2000
  private running: { label: string; action: Action } | undefined
  private stopped = false

  /** @param logError where failing teardowns are reported */
  constructor(private readonly type: PluginClass, private readonly plugin: Plugin, private readonly logError: (message: string) => void) {}

  /**
   * @param progress where the action's progress() goes, on hosts that show it; closed when it ends
   * @throws Error for an unknown action, an invalid input, one already running, or when the plugin stops meanwhile
   */
  async run(id: string, input: unknown, progress?: ProgressSender): Promise<ActionAnswer | undefined> {
    if (this.stopped) throw new Error("the plugin stopped")
    const actionClass = Declarations.actions(this.type).find(candidate => candidate.id === id)
    if (!actionClass) throw new Error(`unknown action "${id}"`)
    const label = Declarations.actionLabel(actionClass)
    if (this.running) throw new Error(`${this.running.label} is still running`)
    const parsed = Declarations.actionInput(actionClass).safeParse(input ?? {})
    if (!parsed.success) throw new Error(`invalid input: ${z.prettifyError(parsed.error)}`)
    const action = ActionHost.build(actionClass, this.plugin, parsed.data)
    if (progress) ActionProgress.attach(action, (text, fraction) => progress.push(text, fraction))
    this.running = { label, action }
    try {
      const result = await action.run()
      if (this.stopped) throw new Error("the plugin stopped")
      return ActionHost.answer(result)
    } finally {
      progress?.close()
      this.running = undefined
      // once stopping, dispose() already disposed it and reported a failing teardown
      if (!this.stopped) await this.disposeQuietly(action, label)
    }
  }

  /** disposes a running action; its run() then fails with "the plugin stopped". Never throws. */
  async dispose() {
    this.stopped = true
    if (this.running) await this.disposeQuietly(this.running.action, this.running.label)
  }

  private async disposeQuietly(action: Action, label: string) {
    try {
      await action.dispose()
    } catch (error) {
      this.logError(`cleaning up after ${label} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private static build(actionClass: ActionClass, plugin: Plugin, input: unknown) {
    return new (actionClass as unknown as new (plugin: Plugin, input: unknown) => Action)(plugin, input)
  }

  // a text, or a message with a panel part; an empty object answers nothing
  private static answer(result: unknown): ActionAnswer | undefined {
    if (typeof result === "string") return ActionHost.clip(result)
    if (!result || typeof result !== "object") return undefined
    const { message, panel } = result as { message?: unknown; panel?: unknown }
    // checked here as the host does, so the author sees the mistake in PluginTestHost too
    const part = panel === undefined ? undefined : PanelPartSchema.safeParse(panel)
    if (part && !part.success) throw new Error(`the answer's panel isn't valid: ${z.prettifyError(part.error)}`)
    const answer = { ...(typeof message === "string" ? { message: ActionHost.clip(message) } : {}), ...(part ? { panel: part.data } : {}) }
    return Object.keys(answer).length > 0 ? answer : undefined
  }

  // never ends on half of a surrogate pair, which would show as a broken character
  private static clip(text: string) {
    if (text.length <= ActionHost.MAX_RESULT) return text
    const cut = text.slice(0, ActionHost.MAX_RESULT - 1)
    return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
  }
}
