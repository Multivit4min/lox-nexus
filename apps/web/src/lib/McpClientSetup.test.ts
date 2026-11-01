import assert from "node:assert/strict"
import { test } from "node:test"
import { McpClientSetup } from "./McpClientSetup.ts"

test("Claude Code gets one command with the token in the header", () => {
  assert.equal(new McpClientSetup("http://192.168.1.10:8080/mcp", "nxp_abc").claudeCode(),
    "claude mcp add --transport http nexus http://192.168.1.10:8080/mcp --header \"Authorization: Bearer nxp_abc\"")
})

test("Claude Desktop goes through mcp-remote, with no space in any argument and the token in env", () => {
  const config = JSON.parse(new McpClientSetup("http://192.168.1.10:8080/mcp", "nxp_abc").claudeDesktop()) as {
    mcpServers: { nexus: { command: string; args: string[]; env: Record<string, string> } }
  }
  const { command, args, env } = config.mcpServers.nexus
  assert.equal(command, "npx")
  assert.deepEqual(args, ["-y", "mcp-remote", "http://192.168.1.10:8080/mcp", "--header", "Authorization:${NEXUS_AUTH}", "--allow-http"])
  assert.ok(args.every(arg => !arg.includes(" ")), "Windows splits arguments at spaces")
  assert.deepEqual(env, { NEXUS_AUTH: "Bearer nxp_abc" })
})

test("--allow-http only for plain http to another computer", () => {
  const plain = (endpoint: string) => new McpClientSetup(endpoint, "t").plainHttp
  assert.deepEqual([plain("http://nexus.lan/mcp"), plain("https://nexus.lan/mcp"), plain("http://localhost:8080/mcp"), plain("http://127.0.0.1/mcp")], [true, false, false, false])
  assert.ok(!new McpClientSetup("https://nexus.example/mcp", "t").claudeDesktop().includes("--allow-http"))
})
