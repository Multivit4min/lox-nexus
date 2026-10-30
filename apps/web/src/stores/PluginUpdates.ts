import { computed, shallowRef } from "vue"
import type { PluginUpdatesDto } from "@lox-nexus/api"
import type { PluginPackageApi } from "../api/PluginPackageApi.ts"

/**
 * Which installed plugins have a newer version, for the badge on Plugins, the banner and the
 * cards. Loaded at start and by the plugin pages; git plugins are only looked up when the user
 * asks (check()). A failed load keeps what was known.
 */
export class PluginUpdates {
  readonly state = shallowRef<PluginUpdatesDto>({ updates: [], problems: [] })
  readonly count = computed(() => this.state.value.updates.length)
  /** the ones "Update all" installs: from the local repository */
  readonly local = computed(() => this.state.value.updates.filter(update => update.source === "local"))

  constructor(private readonly api: Pick<PluginPackageApi, "updates" | "checkUpdates">) {}

  of(id: string) {
    return this.state.value.updates.find(update => update.id === id)
  }

  async load() {
    this.state.value = await this.api.updates().catch(() => this.state.value)
  }

  /** @throws what the request throws, so the page can say why */
  async check() {
    this.state.value = await this.api.checkUpdates()
  }
}
