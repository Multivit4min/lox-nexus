import type { Logger } from "pino"
import { AppVersion } from "../AppVersion.ts"
import type { Config } from "../config/Config.ts"
import type { Database } from "../db/Database.ts"
import { BackupController } from "../http/controllers/BackupController.ts"
import { BackupService } from "./BackupService.ts"
import { RestoreService } from "./RestoreService.ts"

/** Builds the backup API; kept out of NexusApp, which only adds the controller. */
export class BackupAssembly {
  static controller(config: Config, databases: { main: Database; history: Database }, restart: (() => void) | undefined, log: Logger) {
    const backups = new BackupService({
      dataDir: config.dataDir, database: databases.main, history: databases.history, pluginsDir: config.pluginsDir, version: AppVersion.read(), log
    })
    return new BackupController(backups, new RestoreService(config.dataDir), restart)
  }
}
