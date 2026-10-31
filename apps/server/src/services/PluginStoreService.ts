import type { PluginStoreClearedDto, PluginStoreEntryDto, PluginStoreValueDto } from "@lox-nexus/api"
import type { PluginSupervisor } from "@lox-nexus/core"
import type { PluginStoreRepository } from "../db/repositories/PluginStoreRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import type { PluginLogs } from "./PluginLogs.ts"
import type { PluginService } from "./PluginService.ts"

/**
 * What an instance saved with `this.store`, to look at, and to wipe as a whole. Single values
 * can't be changed: a plugin trusts what it wrote itself, and half of its data would leave it in a
 * state it never made. Wiping stops a running plugin first, so it can't write in between, and
 * starts it again on an empty store.
 */
export class PluginStoreService {
  constructor(
    private readonly plugins: Pick<PluginService, "get" | "supervisor">,
    private readonly store: Pick<PluginStoreRepository, "entries" | "value" | "clear">,
    private readonly logs: Pick<PluginLogs, "log">
  ) {}

  /** @throws HttpError 404 unknown instance */
  entries(id: string): PluginStoreEntryDto[] {
    this.plugins.get(id)
    return this.store.entries(id)
  }

  /** @throws HttpError 404 unknown instance or key */
  value(id: string, key: string): PluginStoreValueDto {
    this.plugins.get(id)
    const found = this.store.value(id, key)
    if (!found) throw HttpError.notFound(`stored key "${key}"`)
    return { key, value: found.value }
  }

  /** wipes every key: a running instance is stopped, wiped and started again. @throws HttpError 404 unknown instance */
  async clear(id: string, by: string): Promise<PluginStoreClearedDto> {
    const instance = this.plugins.get(id)
    let cleared = 0
    const wipe = () => (cleared = this.store.clear(id))
    const supervisor = this.supervisorOf(id)
    if (supervisor) await supervisor.whileStopped(wipe)
    else wipe()
    this.logs.log(instance, "info", `stored data cleared by ${by} (${cleared} ${cleared === 1 ? "key" : "keys"})`)
    return { cleared, instance: this.plugins.get(id) }
  }

  // an instance whose plugin isn't installed has no supervisor; its store is wiped all the same
  private supervisorOf(id: string): Pick<PluginSupervisor, "whileStopped"> | undefined {
    try {
      return this.plugins.supervisor(id)
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) return undefined
      throw error
    }
  }
}
