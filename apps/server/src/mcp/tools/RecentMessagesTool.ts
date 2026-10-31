import type { Recorder } from "@lox-nexus/core"
import { MessageFormatter } from "@lox-nexus/core"
import { z } from "zod"
import type { McpTool } from "../McpTool.ts"

const Input = z.object({
  pattern: z.string().max(300).optional().describe("a topic or pattern: + for one level, # for the rest, e.g. \"loxone/house/#\""),
  limit: z.number().int().min(1).max(200).default(50)
})

/** What went over the bus lately, newest last, one line per message with its id for `trace`. */
export class RecentMessagesTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "recent_messages"
  readonly title = "Recent bus messages"
  readonly description = "The latest messages on the bus (values, commands, forces, results), one line each with its id, time (UTC), topic, value and where it came from. Filter by topic pattern. Pass an id to trace to see what it caused and why."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true }
  readonly input = Input
  private readonly messages = new MessageFormatter({ utc: true, topicWidth: 0 })

  constructor(private readonly recorder: Pick<Recorder, "recent">) {}

  run(input: z.infer<typeof Input>) {
    const lines = this.recorder.recent(input.limit, input.pattern).map(message => `${message.id}  ${this.messages.format(message)}`)
    return lines.length ? lines.join("\n") : "no messages"
  }
}
