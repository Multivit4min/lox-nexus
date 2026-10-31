import { Disposable, type Clock } from "@lox-nexus/plugin-sdk"
import type { Logger } from "pino"
import type { ChangeLock } from "../http/ChangeLock.ts"
import type { Controller } from "../http/Controller.ts"
import { McpAudit } from "./McpAudit.ts"
import { McpController } from "./McpController.ts"
import { McpDispatcher } from "./McpDispatcher.ts"
import { McpRateLimit } from "./McpRateLimit.ts"
import type { McpResource } from "./McpResource.ts"
import type { McpTool } from "./McpTool.ts"
import { ResourceRegistry } from "./ResourceRegistry.ts"
import { ToolCall } from "./ToolCall.ts"
import { ToolRegistry } from "./ToolRegistry.ts"

/** what the MCP interface needs from the app */
export interface McpDeps {
  tools: readonly McpTool[]
  resources: readonly McpResource[]
  lock?: Pick<ChangeLock, "enter">
  log: Logger
  clock?: Clock
  version: string
}

/** Builds the MCP interface (ADR 0020) and owns its rate limit; NexusApp adds its controller to the API. */
export class McpAssembly extends Disposable {
  readonly dispatcher: McpDispatcher

  constructor(deps: McpDeps) {
    super()
    const limit = this.own(new McpRateLimit(deps.clock))
    const call = new ToolCall(limit, deps.lock, new McpAudit(deps.log), deps.log)
    this.dispatcher = new McpDispatcher(new ToolRegistry(deps.tools), new ResourceRegistry(deps.resources), call, deps.version, limit, deps.log)
  }

  controller(): Controller {
    return new McpController(this.dispatcher)
  }
}
