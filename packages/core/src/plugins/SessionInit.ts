import type { SupervisorDeps } from "./PluginSupervisor.ts"
import type { PluginInstanceConfig } from "./PluginTypes.ts"

/** What a plugin's `init` carries, read fresh at every start (store, time zone, log level). */
export class SessionInit {
  static of(instance: PluginInstanceConfig, deps: Pick<SupervisorDeps, "store" | "timeZone" | "logs">) {
    return {
      instanceId: instance.id, slug: instance.slug, config: instance.config, store: deps.store.load(instance.id),
      timeZone: deps.timeZone?.(), logLevel: deps.logs.level?.(instance.id), configVersion: instance.configVersion ?? 1
    }
  }
}
