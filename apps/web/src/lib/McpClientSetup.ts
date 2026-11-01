/** What an MCP client needs to reach Nexus with an access token, ready to paste. */
export class McpClientSetup {
  constructor(private readonly endpoint: string, private readonly token: string) {}

  /** one line for Claude Code; the quoting works alike in PowerShell, Command Prompt, bash and zsh */
  claudeCode() {
    return `claude mcp add --transport http nexus ${this.endpoint} --header "Authorization: Bearer ${this.token}"`
  }

  /**
   * The entry for Claude Desktop's claude_desktop_config.json. Claude Desktop only starts local
   * servers, so mcp-remote (run with npx) passes the calls on. On Windows Claude Desktop hands
   * arguments with spaces to npx unquoted, which splits "Authorization: Bearer …" apart; so the
   * header has no space and takes its value from an environment variable, as mcp-remote advises.
   */
  claudeDesktop() {
    const args = ["-y", "mcp-remote", this.endpoint, "--header", "Authorization:${NEXUS_AUTH}", ...(this.plainHttp ? ["--allow-http"] : [])]
    return JSON.stringify({ mcpServers: { nexus: { command: "npx", args, env: { NEXUS_AUTH: `Bearer ${this.token}` } } } }, null, 2)
  }

  /** mcp-remote refuses http:// except to this computer unless told otherwise, since the token then travels unencrypted */
  get plainHttp() {
    const url = new URL(this.endpoint)
    return url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  }
}
