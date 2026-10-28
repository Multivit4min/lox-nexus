import { z } from "@lox-nexus/plugin-sdk"
import { VariableName } from "./nexus/VariableName.ts"

/** The params of every sensor and actuator: the name the script uses for the value. */
export const variableParams = z.object({
  name: VariableName.schema.describe(`The variable name in the script (${VariableName.rule})`)
})

export type VariableParams = z.infer<typeof variableParams>
