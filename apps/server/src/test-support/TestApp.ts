import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Config } from "../config/Config.ts"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { NexusApp, type NexusAppOptions } from "../NexusApp.ts"
import { ApiClient } from "./ApiClient.ts"

/** A NexusApp on 127.0.0.1 with a random port, an in-memory (or temp file) database and cheap password hashing. */
export class TestApp {
  readonly app: NexusApp
  address = ""

  constructor(options: NexusAppOptions = {}) {
    const config = new Config({ NEXUS_HTTP_HOST: "127.0.0.1", NEXUS_HTTP_PORT: "0", NEXUS_DATA_DIR: os.tmpdir() })
    this.app = new NexusApp(config, LoggerFactory.silent(), { databaseFile: ":memory:", hasherCost: 1024, ...options })
  }

  static async start(options: NexusAppOptions = {}) {
    const test = new TestApp(options)
    test.address = await test.app.start()
    return test
  }

  /** a client without a session */
  client(remoteAddress?: string) {
    return new ApiClient(this.app.server!.app, remoteAddress)
  }

  /** runs first-run setup and returns the logged-in client */
  async admin() {
    const client = this.client()
    const response = await client.post("/api/auth/setup", { username: "admin", password: "correct horse" })
    if (response.statusCode !== 200) throw new Error(`setup failed: ${response.body}`)
    return client
  }

  dispose() {
    return this.app.dispose()
  }

  /** a fresh directory for tests that need a database file across restarts */
  static tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "lox-nexus-test-"))
  }
}
