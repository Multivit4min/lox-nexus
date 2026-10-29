import { signalName, z } from "@lox-nexus/plugin-sdk"
import { VariableName } from "./nexus/VariableName.ts"

/** The params of every sensor and actuator: the name the script uses for the value. */
export const variableParams = z.object({
  name: signalName(VariableName.schema).meta({ title: "Variable", description: `The variable's name in the script (${VariableName.rule})` })
})

export type VariableParams = z.infer<typeof variableParams>
