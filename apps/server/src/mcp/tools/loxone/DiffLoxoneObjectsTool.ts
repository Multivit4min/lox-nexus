import { ProjectDiff, type LoxoneSignalDto, type ProjectRow } from "@lox-nexus/api"
import { z } from "zod"
import type { McpRefs } from "../../McpRefs.ts"
import type { McpTool } from "../../McpTool.ts"

const Input = z.object({
  miniserver: z.string().min(1).max(100).describe("the Miniserver's slug"),
  objects: z.array(z.object({
    packetId: z.string().min(1).max(8),
    direction: z.enum(["in", "out"]).describe("as Nexus sees it: in for an intercommunication output in Loxone Config, out for an input"),
    dataType: z.int().min(0).max(255).describe("0 Digital, 1 Analog, 2 Text, 3 T5, 4 Smart RGBW, 5 Smart single channel, 6 Smart tunable white"),
    label: z.string().max(200),
    description: z.string().max(500).optional()
  })).max(1000).describe("the intercommunication objects of this Nexus peer as read from Loxone Config")
})

/** Compares objects read from Loxone Config with the Loxone signals Nexus has, like the project import. */
export class DiffLoxoneObjectsTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "diff_loxone_objects"
  readonly title = "Compare with Loxone Config"
  readonly description = "Compare the intercommunication objects of this Nexus peer, as you read them from Loxone Config, with the Loxone signals Nexus has, matched by direction and packet id. Answers rows by status (new, differs, same, unsupported, removed) and, for new and differing ones, the input for create_loxone_signals or update_loxone_signal. \"removed\" means Nexus has it but you didn't pass it: only meaningful when you passed all objects."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(private readonly refs: McpRefs, private readonly loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }) {}

  run(input: z.infer<typeof Input>) {
    const ms = this.refs.miniserver(input.miniserver)
    const peer = { miniserverId: ms.remoteId, miniserverPort: ms.port, label: "Lox Nexus", id: ms.ownId, host: "", port: ms.listenPort, encrypted: ms.hasPassword, signals: input.objects }
    const rows = ProjectDiff.rows(peer, this.loxoneSignals.list(ms.id))
    const of = (status: ProjectRow["status"]) => rows.filter(row => row.status === status)
    return {
      new: of("new").map(row => ({ packetId: row.signal.packetId, direction: row.signal.direction, input: ProjectDiff.inputFor(row) })),
      differs: of("differs").map(row => ({ signal: row.existing!.topic, change: ProjectDiff.typeChange(row), input: ProjectDiff.inputFor(row) })),
      same: of("same").length,
      unsupported: of("unsupported").map(row => `${row.signal.direction}:${row.signal.packetId} (data type ${row.signal.dataType})`),
      removed: of("removed").map(row => row.existing!.topic)
    }
  }
}
