import { AsyncLocalStorage } from "node:async_hooks"
import type vm from "node:vm"
import { Disposable, type PluginStatus } from "@lox-nexus/plugin-sdk"
import { ScriptCompiler } from "./ScriptCompiler.ts"
import { ScriptConsole } from "./ScriptConsole.ts"
import { ScriptErrors } from "./ScriptErrors.ts"
import { ScriptFetch } from "./ScriptFetch.ts"
import { ScriptGlobals } from "./ScriptGlobals.ts"
import { ScriptGuard } from "./ScriptGuard.ts"
import type { ScriptLog } from "./ScriptLog.ts"
import { ScriptRealm } from "./ScriptRealm.ts"
import type { ScriptState } from "./ScriptState.ts"
import { ScriptTimers } from "./ScriptTimers.ts"

/** What the runner needs from the plugin. */
export interface ScriptHost {
  readonly log: ScriptLog
  readonly status: PluginStatus
  readonly state: ScriptState
  /** builds the script's `nexus` object for its realm */
  nexus(realm: ScriptRealm): unknown
}

/**
 * Compiles and runs one script in a fresh context. Everything the script starts (timers, requests)
 * is owned here, so disposing the runner ends the script.
 *
 * The synchronous part of the top level runs with a timeout, so `while (true) {}` fails the start
 * instead of hanging it. Later callbacks run without one: Node can't interrupt them, and a hung
 * worker is caught by the host's ping and restarted.
 */
export class ScriptRunner extends Disposable {
  static readonly TOP_LEVEL_TIMEOUT_MS = 1000
  readonly guard: ScriptGuard
  private errors = new ScriptErrors(0)
  private timers: ScriptTimers | undefined
  private realm: ScriptRealm | undefined

  constructor(private readonly host: ScriptHost) {
    super()
    this.guard = new ScriptGuard(host.log, host.state, () => this.errors, () => this.isDisposed)
  }

  /** timers of the script waiting to fire */
  get activeTimers() {
    return this.timers?.active ?? 0
  }

  /** a value as an object of the script's realm (see ScriptRealm.adopt) */
  adopt(value: unknown): unknown {
    return this.realm ? this.realm.adopt(value) : value
  }

  /**
   * A promise rejected without a handler. Everything that runs in this worker besides the plugin's
   * own code (which handles its promises) is the script, so it is the script's: also promises made
   * by host functions it called (`new Response(text).json().then(…)`).
   */
  rejected(reason: unknown) {
    this.guard.report("a promise without a rejection handler", reason)
  }

  /**
   * Runs the top level; its asynchronous rest continues in the background.
   * @throws Error for a syntax error (with line and column) or a top level that doesn't return
   */
  start(code: string) {
    const { script, errors } = new ScriptCompiler().compile(code)
    this.errors = errors
    const realm = this.realm = new ScriptRealm()
    // start() runs outside any command, so this context carries no cause
    const root = AsyncLocalStorage.snapshot()
    const timers = this.timers = this.own(new ScriptTimers(this.guard, message => realm.typeError(message), fn => root(fn)))
    const fetcher = this.own(new ScriptFetch(realm.Promise))
    const scriptConsole = new ScriptConsole(this.host.log, () => this.errors).build()
    realm.expose(ScriptGlobals.build({ nexus: this.host.nexus(realm), console: scriptConsole, timers: timers.globals(), fetch: fetcher.fetch }))
    this.host.state.started()
    this.runTopLevel(script, realm).then(() => this.host.state.finished(), (error: unknown) => this.topLevelFailed(error))
  }

  private runTopLevel(script: vm.Script, realm: ScriptRealm): Promise<unknown> {
    try {
      return script.runInContext(realm.context, { timeout: ScriptRunner.TOP_LEVEL_TIMEOUT_MS }) as Promise<unknown>
    } catch (error) {
      // whatever the top level started before it hung must not outlive the failed start
      this.dispose().catch(() => undefined)
      if ((error as { code?: unknown }).code !== "ERR_SCRIPT_EXECUTION_TIMEOUT") throw error
      throw new Error(`the top level of the script ran longer than ${ScriptRunner.TOP_LEVEL_TIMEOUT_MS} ms, probably an endless loop; ` +
        "run long work in timers, nexus.on handlers or after an await", { cause: error })
    }
  }

  /**
   * The script keeps running: timers and handlers registered before the error still work. It is
   * reported as degraded, since its setup most likely did not finish.
   */
  private topLevelFailed(error: unknown) {
    if (this.isDisposed) return
    const text = this.errors.describe(error)
    this.host.state.topLevelFailed(text)
    this.host.log.write("error", `the script's top level failed: ${text}`, { stack: this.errors.stack(error) })
    this.host.status.set("degraded", `the script's top level failed: ${text}`)
  }
}
