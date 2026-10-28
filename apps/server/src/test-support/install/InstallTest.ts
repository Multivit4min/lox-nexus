import fs from "node:fs"
import path from "node:path"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { NexusApp } from "../../NexusApp.ts"
import type { InstallLimits } from "../../plugins/install/InstallLimits.ts"
import type { ApiClient } from "../ApiClient.ts"
import { TestApp } from "../TestApp.ts"

/** A TestApp with its own data folder, real plugin workers and git allowed over file://. */
export class InstallTest {
  private constructor(readonly test: TestApp, readonly dataDir: string) {}

  /**
   * @param options.dataDir reuse a folder, e.g. to restart on the same installs
   * @param options.repository the local plugin repository folder
   * @param options.devPlugins a development plugins folder (NEXUS_DEV_PLUGINS_DIR)
   */
  static async start(options: { dataDir?: string; repository?: string; devPlugins?: string; limits?: Partial<InstallLimits> } = {}) {
    const dataDir = options.dataDir ?? TestApp.tempDir()
    const env: Record<string, string> = {
      NEXUS_DATA_DIR: dataDir,
      ...(options.repository ? { NEXUS_PLUGIN_REPOSITORY: options.repository } : {}),
      ...(options.devPlugins ? { NEXUS_DEV_PLUGINS_DIR: options.devPlugins } : {})
    }
    const install = { gitSchemes: ["file"], ...(options.limits ? { limits: options.limits } : {}) }
    const test = await TestApp.start({ databaseFile: path.join(dataDir, "nexus.db"), install }, env)
    return new InstallTest(test, dataDir)
  }

  get app(): NexusApp {
    return this.test.app
  }

  /** the installed plugins' folder */
  get pluginsDir() {
    return path.join(this.dataDir, "plugins")
  }

  /** what is left in the staging folder (nothing, after any finished request) */
  staged() {
    const dir = path.join(this.pluginsDir, ".staging")
    return fs.existsSync(dir) ? fs.readdirSync(dir) : []
  }

  stageZip(client: ApiClient, data: Buffer, name = "fixture.zip") {
    return client.post(`/api/plugin-packages/stage/zip?name=${encodeURIComponent(name)}`, data, { "content-type": "application/zip" })
  }

  /** stages and confirms a ZIP; @returns the confirm response */
  async installZip(client: ApiClient, data: Buffer) {
    const staged = await this.stageZip(client, data)
    if (staged.statusCode !== 201) throw new Error(`staging failed: ${staged.body}`)
    return client.post(`/api/plugin-packages/stage/${staged.json<{ stagingId: string }>().stagingId}/confirm`, { expectedActive: null })
  }

  /** the topic's next value, or its current one; real workers take real time, so this waits on the bus */
  value(topic: string, timeoutMs = 10_000) {
    const current = this.app.bus.current(topic)?.value
    if (current) return Promise.resolve(current)
    return new Promise<Value>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.dispose()
        reject(new Error(`no value on ${topic}`))
      }, timeoutMs)
      const subscription = this.app.bus.subscribe(topic, message => {
        if (!message.value) return
        clearTimeout(timer)
        void subscription.dispose()
        resolve(message.value)
      })
    })
  }

  /** polls `check` until it is true; for state that real workers reach in their own time */
  async until(check: () => boolean, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out waiting")
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }

  /** disposes the app; the data folder stays unless `remove` */
  async dispose(remove = true) {
    await this.test.dispose()
    if (remove) fs.rmSync(this.dataDir, { recursive: true, force: true })
  }
}
