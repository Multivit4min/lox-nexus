import type { Recorder, TraceNode } from "@lox-nexus/core"
import { MessageFormatter } from "@lox-nexus/core"
import { z } from "zod"
import { HttpError } from "../../http/HttpError.ts"
import type { McpTool } from "../McpTool.ts"

const Input = z.object({ message: z.string().min(1).max(100).describe("a message id from recent_messages or get_signal") })

/** What a message caused and what caused it: the causal tree as indented lines. */
export class TraceTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "trace"
  readonly title = "Trace a message"
  readonly description = "The causal tree of a bus message: what started it (a Miniserver, a plugin, a wire, a user) and every message it caused through wires, as indented lines. Use it to explain why a value arrived or didn't."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input
  private readonly messages = new MessageFormatter({ utc: true, topicWidth: 0 })

  constructor(private readonly recorder: Pick<Recorder, "trace">) {}

  run(input: z.infer<typeof Input>) {
    const tree = this.recorder.trace(input.message)
    if (tree.length === 0) throw HttpError.notFound(`message ${input.message} (unknown, or no longer kept)`)
    const lines: string[] = []
    const walk = (nodes: TraceNode[], depth: number) => {
      for (const node of nodes) {
        lines.push(`${"  ".repeat(depth)}${node.message.id}  ${this.messages.format(node.message)}`)
        walk(node.children, depth + 1)
      }
    }
    walk(tree, 0)
    return lines.join("\n")
  }
}
