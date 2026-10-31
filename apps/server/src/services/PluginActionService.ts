import { PluginNotRunningError, PluginRequestError, PluginUnavailableError, type PluginSupervisor } from "@lox-nexus/core"
import type { PluginActionResultDto } from "@lox-nexus/api"
import { HttpError } from "../http/HttpError.ts"
import { PluginErrors } from "./PluginErrors.ts"
import type { PluginEvents } from "./PluginEvents.ts"
import type { PluginLogs } from "./PluginLogs.ts"

/**
 * Runs a plugin's actions (`static actions`) for the instance page. Who started which action and
 * how it ended goes to the instance's log; the input never does, as it may hold a pairing code.
 */
export class PluginActionService {
  constructor(
    private readonly supervisor: (id: string) => PluginSupervisor,
    private readonly logs: Pick<PluginLogs, "log">,
    private readonly events?: Pick<PluginEvents, "emit">
  ) {}

  /**
   * @param runId tags the action's progress on the stream, so the page that started it shows it
   * @throws HttpError 404 unknown instance or action, 409 the instance isn't running (or its plugin
   *   isn't available), 400 the plugin refused (invalid input, a failure), 502 its answer can't be
   *   shown, 503 timeout or the plugin stopped
   */
  async run(instanceId: string, actionId: string, input: unknown, by: string, runId?: string): Promise<PluginActionResultDto> {
    const supervisor = this.supervisor(instanceId)
    const action = supervisor.pkg.description.actions?.find(candidate => candidate.id === actionId)
    if (!action) throw HttpError.notFound(`action "${actionId}"`)
    if (supervisor.state !== "running" && supervisor.state !== "degraded") throw HttpError.conflict("the plugin is not running")
    const instance = { id: instanceId, slug: supervisor.config.slug }
    this.logs.log(instance, "info", `action "${action.label}" started by ${by}`)
    try {
      const progress = runId && this.events ? this.progress(instanceId, runId, this.events) : undefined
      const answer = await supervisor.calls.action(actionId, input, progress)
      // the answer may carry a code (an "open pairing window" action), so only the outcome is logged
      this.logs.log(instance, "info", `action "${action.label}" done`)
      return answer
    } catch (error) {
      const http = PluginActionService.http(error, supervisor.state)
      this.logs.log(instance, "warn", `action "${action.label}" failed: ${http instanceof Error ? http.message : String(http)}`)
      throw http
    }
  }

  private progress(instanceId: string, runId: string, events: Pick<PluginEvents, "emit">) {
    return (text: string, fraction?: number) => events.emit({ type: "plugin-action-progress", instanceId, runId, text, ...(fraction === undefined ? {} : { fraction }) })
  }

  // the worker answers "the plugin stopped" itself when it is stopped meanwhile: unavailable, not a refusal
  private static http(error: unknown, state: PluginSupervisor["state"]) {
    if (error instanceof PluginRequestError && state !== "running" && state !== "degraded") return new HttpError(503, error.message)
    if (error instanceof PluginNotRunningError) return HttpError.conflict(error.message)
    if (error instanceof PluginRequestError) return HttpError.badRequest(error.message)
    if (error instanceof PluginUnavailableError) return new HttpError(503, error.message)
    return PluginErrors.unshowable(error) ?? error
  }
}
