import type { PluginStore } from "@lox-nexus/plugin-sdk"
import { Environment, Filesystem, StorageService } from "@matter/main"
import { StoreStorageDriver, type StoreStorageOptions } from "./StoreStorageDriver.ts"

/**
 * The matter.js environment one bridge runs in, set up in code: a plugin worker has an empty
 * environment and must not write files. A child of matter.js's default environment, so the
 * network, crypto and mDNS services are shared while storage is the plugin store.
 */
export class MatterEnvironment {
  static readonly DRIVER = "lox-nexus-store"

  readonly env: Environment

  constructor(store: PluginStore, options: StoreStorageOptions) {
    MatterEnvironment.quietProcess()
    const env = new Environment("lox-nexus", Environment.default)
    const storage = new StorageService(env)
    // hides the parent's file system, so storage can't take the file path (~/.matter/<node>). Only
    // after the first service: on a fresh environment delete() has nowhere to record the hiding
    env.delete(Filesystem)
    storage.registerDriver({
      id: MatterEnvironment.DRIVER,
      create: namespace => new StoreStorageDriver(store, namespace.namespace, options)
    })
    storage.configuredDriver = MatterEnvironment.DRIVER
    this.env = env
  }

  /** whether matter.js could reach a file system from here (it must not) */
  get hasFilesystem() {
    return this.env.has(Filesystem) || this.env.get(StorageService).hasFilesystem
  }

  /** ends the environment's lifetime, which joined the default environment's; after the node closed */
  close() {
    this.env[Symbol.dispose]()
  }

  /**
   * matter.js's process manager would trap SIGINT/SIGTERM and set the exit code; in a worker
   * thread (and in a test process) that belongs to the host. Read when a node starts.
   */
  private static quietProcess() {
    const vars = Environment.default.vars
    vars.set("runtime.signals", false)
    vars.set("runtime.exitcode", false)
  }
}
