import { z } from "@lox-nexus/plugin-sdk"
import { JsonPath } from "../call/JsonPath.ts"
import { HookMethods } from "../hooks/HookMethod.ts"
import { HookName } from "../hooks/HookName.ts"

/**
 * Params of the value sensors. Flat with an object-level check (rather than a union per source),
 * so the UI's form stays one simple object: `path` for json, `name` for query and form.
 */
export const valueParams = z.object({
  hook: HookName.schema,
  method: HookMethods.schema("POST"),
  source: z.enum(["json", "query", "form", "body"]).default("json").meta({
    title: "Value from",
    description: "Which part of the call holds the value",
    enumLabels: { json: "JSON body", query: "Query parameter", form: "Form field", body: "Whole body" }
  }),
  path: z.string().max(JsonPath.MAX_LENGTH).optional().meta({
    title: "JSON path",
    description: "For JSON body: where the value sits, e.g. sensor.values[0].temp"
  }),
  name: z.string().min(1).max(100).optional().meta({
    title: "Field name",
    description: "For Query parameter or Form field: the name of the parameter or field to read"
  })
}).superRefine((params, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message })
  if (params.source === "json") {
    const problem = JsonPath.problem(params.path ?? "")
    if (problem) issue("path", problem)
  }
  if ((params.source === "query" || params.source === "form") && !params.name) issue("name", `source ${params.source} needs a name`)
  // the query parameter "token" carries the instance secret; a signal must not publish it on the bus
  if (params.source === "query" && params.name === "token") issue("name", "\"token\" is reserved for the instance token")
})

export type ValueParams = z.infer<typeof valueParams>
