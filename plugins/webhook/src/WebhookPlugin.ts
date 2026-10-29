import { Plugin } from "@lox-nexus/plugin-sdk"
import { AuthWarnings } from "./auth/AuthWarnings.ts"
import { TokenGuard } from "./auth/TokenGuard.ts"
import { CallStats } from "./hooks/CallStats.ts"
import { HookDispatcher } from "./hooks/HookDispatcher.ts"
import { HookRegistry } from "./hooks/HookRegistry.ts"
import { NumberSensor } from "./sensors/NumberSensor.ts"
import { SwitchSensor } from "./sensors/SwitchSensor.ts"
import { TextSensor } from "./sensors/TextSensor.ts"
import { TriggerSensor } from "./sensors/TriggerSensor.ts"
import { webhookConfigSchema, type WebhookConfig } from "./WebhookConfig.ts"
import { WebhookPanel } from "./WebhookPanel.ts"

/**
 * Inbound webhooks: external systems call `/hook/<instance>/<hook name>` with the instance token (if set),
 * and the signals using that hook name fire a pulse or take a value from the call. One catch-all
 * route serves every hook, so adding a signal never registers a route.
 *
 * No catalog: hooks are names the user chooses, there is nothing to browse.
 */
export class WebhookPlugin extends Plugin<WebhookConfig> {
  static readonly config = webhookConfigSchema
  static readonly sensors = [TriggerSensor, NumberSensor, TextSensor, SwitchSensor]

  readonly hooks = new HookRegistry()
  readonly stats = new CallStats()
  private readonly warnings = this.own(new AuthWarnings(this.log))
  private readonly dispatcher = new HookDispatcher(this.hooks, new TokenGuard(this.config.token), this.stats, this.warnings)

  override start() {
    this.http.route("*", "/*", request => this.dispatcher.handle(request))
    // degraded, so the instance shows the warning for as long as it runs without a token
    if (this.config.token === undefined) {
      const warning = "no token set: every call is accepted, so anyone who can reach Nexus can trigger these hooks; set a token in the instance settings"
      this.status.set("degraded", warning)
      this.log.warn(warning)
    }
  }

  override panel() {
    return new WebhookPanel(this.hooks, this.stats, this.slug, this.config.token).build()
  }
}
