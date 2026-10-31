import type { PluginCheckDto, PluginCheckInput, PluginDiscoverInput, PluginDiscoverResultDto, PluginInstanceDto, PluginInstanceInput } from "@lox-nexus/api"

/** what the plugin instance tools call: PluginService, as the REST controller does */
export interface InstanceWrites {
  get(id: string): PluginInstanceDto
  create(input: PluginInstanceInput, options?: { secretsLater?: readonly string[] }): Promise<PluginInstanceDto>
  update(id: string, input: PluginInstanceInput, by: string): Promise<PluginInstanceDto>
  remove(id: string, by: string): Promise<void>
  start(id: string): Promise<PluginInstanceDto>
  stop(id: string): Promise<PluginInstanceDto>
}

/** PluginSettingsCheck: the plugin checks settings, tests the connection, searches the network */
export interface SettingsChecks {
  check(input: PluginCheckInput): Promise<PluginCheckDto>
  discover(plugin: string, input: PluginDiscoverInput): Promise<PluginDiscoverResultDto>
}

/** what the tools answer about an instance: never its secret values, but which are still missing */
export class InstanceAnswer {
  static of(instance: PluginInstanceDto, missingSecrets: readonly string[] = []) {
    const { slug, plugin, label, enabled, state, config, secrets } = instance
    return {
      slug, plugin, label, enabled, state, config,
      ...(secrets.length ? { secretsSet: secrets } : {}),
      ...(instance.statusMessage ? { status: instance.statusMessage } : {}),
      ...(instance.lastError ? { lastError: instance.lastError } : {}),
      ...(missingSecrets.length ? { missingSecrets, next: `ask the user to enter ${missingSecrets.join(", ")} on the instance's page; saving there starts it` } : {}),
      page: `#/plugins/${instance.id}`
    }
  }
}
