import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { AccessScope, CreatedAccessTokenDto } from "@lox-nexus/api"
import type { ApiClient } from "../test-support/ApiClient.ts"
import { TestApp } from "../test-support/TestApp.ts"

// What each scope may call: a tool that appears here by accident is a security change, so
// adding one means updating this list on purpose. r: read-only, d: destructive (asks first)
const READ = [
  "describe_plugin r", "diff_loxone_objects r", "get_history r", "get_logs r", "get_panel r", "get_signal r", "list_discovered r", "list_signals r", "list_wires r", "loxone_side r",
  "overview r", "plan_bridge r", "preview_wire r", "recent_messages r", "search_catalog r", "system_status r", "trace r"
]
const CONFIGURE = [
  "add_plugin_signals", "adopt_discovered", "bridge", "check_plugin_settings r", "create_loxone_signals", "create_miniserver", "create_wire",
  "delete_loxone_signals d", "delete_miniserver d", "delete_plugin_instance d", "delete_plugin_signals d", "delete_wires d", "discover_setting r",
  "start_miniserver", "stop_miniserver d", "update_loxone_signal", "update_miniserver", "update_plugin_signal", "update_wire"
]

// these act on the house: devices, the Miniserver's inputs, and plugin instances, which run code
const OPERATE = ["create_plugin_instance", "force", "inject", "plugin_instance_lifecycle", "release", "run_plugin_action", "update_plugin_instance"]

describe("tools/list per scope", { timeout: 20_000 }, () => {
  let app: TestApp
  let admin: ApiClient
  const listed = async (scopes: AccessScope[]) => {
    const token = (await admin.post("/api/tokens", { currentPassword: "correct horse", name: scopes.join("+") || "read", scopes })).json<CreatedAccessTokenDto>().token
    const answer = await app.client().post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { authorization: `Bearer ${token}` })
    const tools = answer.json<{ result: { tools: { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }[] } }>().result.tools
    return tools.map(tool => `${tool.name}${tool.annotations?.readOnlyHint ? " r" : ""}${tool.annotations?.destructiveHint ? " d" : ""}`).sort()
  }

  before(async () => {
    app = await TestApp.start()
    admin = await app.admin()
  })
  after(() => app.dispose())

  test("read", async () => assert.deepEqual(await listed([]), READ))
  test("read and configure", async () => assert.deepEqual(await listed(["configure"]), [...READ, ...CONFIGURE].sort()))
  test("read and operate", async () => assert.deepEqual(await listed(["operate"]), [...READ, ...OPERATE].sort()))
  test("all three", async () => assert.deepEqual(await listed(["configure", "operate"]), [...READ, ...CONFIGURE, ...OPERATE].sort()))
})
