import type { InventoryService } from "../services/InventoryService.ts"
import type { McpTool } from "./McpTool.ts"
import { CreateWireTool } from "./tools/wires/CreateWireTool.ts"
import { DeleteWiresTool } from "./tools/wires/DeleteWiresTool.ts"
import { PreviewWireTool } from "./tools/wires/PreviewWireTool.ts"
import { UpdateWireTool } from "./tools/wires/UpdateWireTool.ts"
import { WireRefs } from "./tools/wires/WireRefs.ts"
import type { WireWrites } from "./tools/wires/WireWrites.ts"

/** The wire tools of A2 (ADR 0020): try transforms, then create, change and delete wires. */
export class McpWireTools {
  readonly tools: McpTool[]

  constructor(wires: WireWrites, inventory: Pick<InventoryService, "signals" | "wires" | "find">) {
    const refs = new WireRefs(inventory)
    this.tools = [
      new PreviewWireTool(refs, wires),
      new CreateWireTool(refs, wires),
      new UpdateWireTool(refs, wires),
      new DeleteWiresTool(refs, wires)
    ]
  }
}
