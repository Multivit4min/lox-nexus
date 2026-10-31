/** What this server speaks of MCP: stateless Streamable HTTP, JSON answers, tools and resources. */
export class McpProtocol {
  /** newest first; Streamable HTTP arrived with 2025-03-26 */
  static readonly SUPPORTED: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26"]
  /** no list changes, subscriptions or logging: there is no stream to send them on */
  static readonly CAPABILITIES = { tools: {}, resources: {}, prompts: {} }

  /** the client's version when we speak it, else our newest (the client then decides) */
  static negotiate(requested: unknown): string {
    return typeof requested === "string" && McpProtocol.SUPPORTED.includes(requested) ? requested : McpProtocol.SUPPORTED[0]!
  }

  static supports(version: string) {
    return McpProtocol.SUPPORTED.includes(version)
  }

  static serverInfo(version: string) {
    return { name: "lox-nexus", title: "Lox Nexus", version }
  }
}
