import { z } from "zod"
import type { McpTool } from "../../McpTool.ts"
import { MiniserverAnswer, MiniserverFields, type MiniserverWrites } from "./MiniserverWrites.ts"

const Input = MiniserverFields.describe("ownId: this Nexus's ICI id as the Miniserver knows it; remoteId: the Miniserver's own ICI id; port: where the Miniserver listens (7777 by default); listenPort: where Nexus listens, which the Miniserver sends to")
type Input = z.input<typeof Input>

/** Adds a Miniserver to talk to over Network Intercommunication; the password, if any, comes from a person. */
export class CreateMiniserverTool implements McpTool<Input> {
  readonly name = "create_miniserver"
  readonly title = "Add a Miniserver"
  readonly description = "Add a Miniserver Nexus talks to over Network Intercommunication (ICI), and start it. No password: if the ICI peer in Loxone Config is encrypted, the user enters the password on the Miniserver's page (`page`). Then loxone_side says what Loxone Config needs."
  readonly scope = "configure" as const
  readonly changes = true
  readonly input = Input as z.ZodType<Input>

  constructor(private readonly miniservers: Pick<MiniserverWrites, "create">) {}

  async run(input: Input) {
    return MiniserverAnswer.of(await this.miniservers.create(input))
  }
}
