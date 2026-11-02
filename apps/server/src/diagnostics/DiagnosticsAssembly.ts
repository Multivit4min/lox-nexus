import type { Clock } from "@lox-nexus/core"
import { Disposable } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import { AppVersion } from "../AppVersion.ts"
import type { Config } from "../config/Config.ts"
import { DiagnosticsController } from "../http/controllers/DiagnosticsController.ts"
import { UpdateController } from "../http/controllers/UpdateController.ts"
import type { NexusApp } from "../NexusApp.ts"
import { DiagnosticsSampler } from "./DiagnosticsSampler.ts"
import { AppUpdateCheck } from "../updates/AppUpdateCheck.ts"
import { ReleaseFeed } from "../updates/ReleaseFeed.ts"
import { StorageSizes } from "./StorageSizes.ts"

/** The parts of the app the samples read. */
export type DiagnosedApp = Pick<NexusApp, "bus" | "wires" | "miniservers" | "plugins" | "persistence" | "history" | "streams">

/**
 * Builds what the System page shows: the diagnostics sampler from the running app, and the check
 * for a newer Nexus. Kept out of NexusApp, which only adds the controllers.
 */
export class DiagnosticsAssembly extends Disposable {
  static readonly WORKER_TIMEOUT_MS = 5000
  readonly sampler: DiagnosticsSampler
  readonly updates: AppUpdateCheck

  constructor(app: DiagnosedApp, config: Config, clock: Clock, log: Logger) {
    super()
    const version = AppVersion.read()
    const storage = new StorageSizes({ database: app.persistence.db.file, history: app.history.database.db.file, pluginsDir: config.pluginsDir })
    this.sampler = this.own(new DiagnosticsSampler({
      bus: app.bus,
      streamClients: () => app.streams?.size ?? 0,
      wires: () => app.wires.list().length,
      miniservers: () => app.miniservers.list().map(ms => {
        const { incomingPerSecond, outgoingPerSecond } = ms.load.current()
        return { id: ms.config.id, label: ms.config.label, incomingPerSecond, outgoingPerSecond }
      }),
      workers: async () => {
        const running = await Promise.allSettled(app.plugins.list().map(async supervisor => ({ supervisor, stats: await this.limited(supervisor.stats()) })))
        return running.flatMap(result => (result.status === "fulfilled" && result.value.stats
          ? [{ instanceId: result.value.supervisor.config.id, label: result.value.supervisor.config.label, ...result.value.stats }]
          : []))
      },
      storage
    }, { version, startedAt: clock.now() }, clock, log))
    this.updates = this.own(new AppUpdateCheck(new ReleaseFeed(fetch), app.persistence.settings, version, { allowed: config.updateCheck, clock, log }))
    this.updates.start()
  }

  /**
   * A worker blocked in a native call (sync IO on a stuck mount) answers only when the block ends;
   * without a limit it would hold up every later sample. A late or failed answer is left out.
   */
  private limited<T>(work: Promise<T | undefined>): Promise<T | undefined> {
    return new Promise(resolve => {
      const cancel = this.after(DiagnosticsAssembly.WORKER_TIMEOUT_MS, () => resolve(undefined))
      work.then(value => resolve(value), () => resolve(undefined)).finally(cancel)
    })
  }

  controllers() {
    return [new DiagnosticsController(this.sampler), new UpdateController(this.updates)]
  }
}
