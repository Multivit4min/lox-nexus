import assert from "node:assert/strict"
import { test } from "node:test"
import { Plugin } from "@lox-nexus/plugin-sdk"
import { z } from "zod"
import { FakePluginTransport } from "../test-support/FakePluginTransport.ts"
import { PluginConfigChecker } from "./PluginConfigChecker.ts"
import { PluginRequestError } from "./RequestTracker.ts"

class Checked extends Plugin<{ host: string }> {
  static readonly config = z.object({ host: z.string().min(1) })
  static async test(config: { host: string }) {
    if (config.host === "down") throw new Error("no answer")
    return `reached ${config.host}`
  }
}

const checker = new PluginConfigChecker(new FakePluginTransport().add("checked.ts", Checked))
const pkg = { entry: "checked.ts" }

test("a throwaway worker checks settings and tests the connection", async () => {
  assert.deepEqual(await checker.check(pkg, { host: "" }), { issues: [{ path: ["host"], message: "Too small: expected string to have >=1 characters" }], config: { host: "" }, version: 1 })
  assert.equal(await checker.test(pkg, { host: "pv" }), "reached pv")
  await assert.rejects(checker.test(pkg, { host: "down" }), (error: Error) => error instanceof PluginRequestError && /no answer/.test(error.message))
})
