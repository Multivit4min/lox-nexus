import assert from "node:assert/strict"
import { test } from "node:test"
import { z } from "zod"
import { HttpError } from "../http/HttpError.ts"
import { McpDispatcher } from "./McpDispatcher.ts"
import type { McpTool } from "./McpTool.ts"
import { McpPrompts } from "./McpPrompts.ts"
import { PromptRegistry } from "./PromptRegistry.ts"
import { ResourceRegistry } from "./ResourceRegistry.ts"
import { ToolCall } from "./ToolCall.ts"
import type { ToolContext } from "./ToolContext.ts"
import { ToolRegistry } from "./ToolRegistry.ts"

const echo: McpTool<{ text: string }> = {
  name: "echo", title: "Echo", description: "answers its input", scope: "read", annotations: { readOnlyHint: true },
  input: z.object({ text: z.string().max(10) }),
  run: input => ({ said: input.text })
}
const configure: McpTool<Record<string, never>> = {
  name: "change", title: "Change", description: "refuses like a service", scope: "configure", changes: true,
  input: z.object({}),
  run: () => {
    throw HttpError.conflict("that name is taken")
  }
}
const broken: McpTool<Record<string, never>> = { name: "broken", title: "Broken", description: "fails", scope: "read", input: z.object({}), run: () => { throw new Error("boom: secret stack") } }
const big: McpTool<Record<string, never>> = { name: "big", title: "Big", description: "too long", scope: "read", input: z.object({}), run: () => "x".repeat(70_000) }

function setup() {
  const errors: unknown[] = []
  const audited: string[] = []
  const call = new ToolCall({ acquire: async () => () => {} }, undefined, { changed: (_c, tool, _i, outcome) => void audited.push(`${tool} ${outcome}`) }, { error: (entry: unknown) => void errors.push(entry) } as never)
  const resources = new ResourceRegistry([{ uri: "nexus://guide", name: "guide", title: "Guide", description: "how", mimeType: "text/markdown", scope: "read", read: () => "# Guide" }], [{
    uriTemplate: "nexus://plugins/{plugin}/readme", name: "readme", title: "README", description: "a plugin's README", mimeType: "text/markdown", scope: "read",
    read: params => `# ${params.plugin}`
  }])
  const dispatcher = new McpDispatcher(new ToolRegistry([echo, configure, broken, big]), resources, new PromptRegistry(McpPrompts.ALL), call, "9.9.9", { acquire: async () => () => {} }, { error: (entry: unknown) => void errors.push(entry) } as never)
  return { dispatcher, errors, audited }
}
const context = (scopes: ToolContext["access"]["scopes"] = ["read"]): ToolContext => ({
  user: { id: "u1", username: "admin" }, access: { tokenId: "t1", name: "agent", scopes }, by: "admin via MCP (agent)", signal: new AbortController().signal
})
const ask = (dispatcher: McpDispatcher, method: string, params?: object, scopes?: ToolContext["access"]["scopes"]) =>
  dispatcher.handle({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }, context(scopes)) as Promise<{ result?: Record<string, unknown>; error?: { code: number; message: string } }>

test("initialize answers the client's version when spoken, else the newest, with the instructions", async () => {
  const { dispatcher } = setup()
  const known = await ask(dispatcher, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })
  assert.equal(known.result?.protocolVersion, "2025-06-18")
  assert.deepEqual(known.result?.serverInfo, { name: "lox-nexus", title: "Lox Nexus", version: "9.9.9" })
  assert.match(String(known.result?.instructions), /Call "overview" first/)
  assert.equal((await ask(dispatcher, "initialize", { protocolVersion: "1999-01-01" })).result?.protocolVersion, "2025-11-25")
})

test("tools are listed and called only within the token's scopes", async () => {
  const { dispatcher } = setup()
  const listed = (await ask(dispatcher, "tools/list")).result?.tools as { name: string; inputSchema: Record<string, unknown> }[]
  assert.deepEqual(listed.map(tool => tool.name), ["echo", "broken", "big"])
  assert.equal(listed[0]?.inputSchema.type, "object")
  assert.equal(listed[0]?.inputSchema.$schema, undefined)
  assert.equal((await ask(dispatcher, "tools/call", { name: "change" })).error?.code, -32602, "configure isn't granted")
  assert.equal((await ask(dispatcher, "tools/call", { name: "nope" })).error?.code, -32602)
  assert.deepEqual((await ask(dispatcher, "tools/call", { name: "echo", arguments: { text: "hi" } })).result, { content: [{ type: "text", text: "{\"said\":\"hi\"}" }] })
})

test("refusals come back as tool errors the model can read; unexpected failures are logged, never shown", async () => {
  const { dispatcher, errors, audited } = setup()
  const invalid = (await ask(dispatcher, "tools/call", { name: "echo", arguments: { text: "far too long here" } })).result
  assert.equal(invalid?.isError, true)
  assert.match(JSON.stringify(invalid), /invalid arguments/)
  const refused = (await ask(dispatcher, "tools/call", { name: "change" }, ["read", "configure"])).result
  assert.deepEqual(refused, { content: [{ type: "text", text: "that name is taken" }], isError: true })
  assert.deepEqual(audited, ["change refused"])
  const failed = (await ask(dispatcher, "tools/call", { name: "broken" })).result
  assert.ok(failed?.isError && !JSON.stringify(failed).includes("secret stack"))
  assert.equal(errors.length, 1)
  const cut = (await ask(dispatcher, "tools/call", { name: "big" })).result as { content: { text: string }[] }
  assert.ok(cut.content[0]!.text.length < 66_000 && cut.content[0]!.text.endsWith("ask for less (a limit, a cursor or a filter)"))
})

test("notifications and responses get no answer; batches, invalid messages and unknown methods get errors", async () => {
  const { dispatcher } = setup()
  assert.equal(await dispatcher.handle({ jsonrpc: "2.0", method: "notifications/initialized" }, context()), undefined)
  assert.equal(await dispatcher.handle({ jsonrpc: "2.0", id: 4, result: {} }, context()), undefined)
  assert.deepEqual(await dispatcher.handle([{ jsonrpc: "2.0", id: 1, method: "ping" }], context()), { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batches are not supported" } })
  assert.equal(((await dispatcher.handle({ id: 7, method: "ping" }, context())) as { error: { code: number } }).error.code, -32600)
  assert.equal((await ask(dispatcher, "sampling/createMessage")).error?.code, -32601)
  assert.deepEqual((await ask(dispatcher, "ping")).result, {})
})

test("resources are listed and read by scope; an unknown one is -32002", async () => {
  const { dispatcher } = setup()
  assert.deepEqual(((await ask(dispatcher, "resources/list")).result?.resources as { uri: string }[]).map(resource => resource.uri), ["nexus://guide"])
  assert.deepEqual((await ask(dispatcher, "resources/read", { uri: "nexus://guide" })).result, { contents: [{ uri: "nexus://guide", mimeType: "text/markdown", text: "# Guide" }] })
  assert.equal((await ask(dispatcher, "resources/read", { uri: "nexus://nothing" })).error?.code, -32002)
})

test("resource templates are listed and fill their variables from the URI", async () => {
  const { dispatcher } = setup()
  const templates = (await ask(dispatcher, "resources/templates/list")).result?.resourceTemplates as { uriTemplate: string }[]
  assert.deepEqual(templates.map(template => template.uriTemplate), ["nexus://plugins/{plugin}/readme"])
  const read = (await ask(dispatcher, "resources/read", { uri: "nexus://plugins/home%20assistant/readme" })).result?.contents as { text: string }[]
  assert.equal(read[0]?.text, "# home assistant")
  assert.equal((await ask(dispatcher, "resources/read", { uri: "nexus://plugins/a/b/readme" })).error?.code, -32002, "a variable is one segment")
})

test("prompts need the scope of the tools they use, and their required arguments", async () => {
  const { dispatcher } = setup()
  assert.deepEqual((await ask(dispatcher, "prompts/list")).result?.prompts, [], "a read token can't follow them")
  const listed = (await ask(dispatcher, "prompts/list", undefined, ["read", "configure"])).result?.prompts as { name: string }[]
  assert.deepEqual(listed.map(prompt => prompt.name), ["connect_plugin_to_loxone", "import_from_loxone_config"])
  const prompt = await ask(dispatcher, "prompts/get", { name: "connect_plugin_to_loxone", arguments: { instance: "ha", miniserver: "haus", what: "room temperatures" } }, ["read", "configure"])
  const messages = prompt.result?.messages as { role: string; content: { text: string } }[]
  assert.equal(messages[0]?.role, "user")
  assert.match(messages[0]!.content.text, /plugin instance "ha" to the Miniserver "haus": room temperatures/)
  assert.match((await ask(dispatcher, "prompts/get", { name: "connect_plugin_to_loxone", arguments: { instance: "ha" } }, ["read", "configure"])).error!.message, /missing arguments: miniserver/)
  assert.equal((await ask(dispatcher, "prompts/get", { name: "import_from_loxone_config", arguments: { miniserver: "x" } })).error?.code, -32602)
})
