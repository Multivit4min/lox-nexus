import { signalName, z } from "@lox-nexus/plugin-sdk"
import { JsonPath } from "../payload/JsonPath.ts"
import { Topic } from "../topics/Topic.ts"

/**
 * Params of every sensor: the topic, and how its payload is read. Flat with an object-level check,
 * so the form stays one simple object.
 */
export const sensorParams = z.object({
  // a new signal is named after its topic
  topic: signalName(Topic.nameSchema).meta({
    title: "Topic",
    description: "The exact topic to read, e.g. zigbee2mqtt/kitchen/sensor; no wildcards"
  }),
  read: z.enum(["text", "json"]).default("text").meta({
    title: "Payload",
    description: "Whether the payload is the value itself, or JSON with the value inside",
    enumLabels: { text: "The value itself (plain text)", json: "JSON" }
  }),
  path: z.string().max(JsonPath.MAX_LENGTH).optional().meta({
    title: "JSON path",
    description: "For JSON: where the value sits, e.g. temperature or state.values[0]; empty for the whole payload"
  })
}).superRefine((params, context) => {
  if (params.read !== "json") return
  const problem = JsonPath.problem(params.path ?? "")
  if (problem) context.addIssue({ code: "custom", path: ["path"], message: problem })
})

export type SensorParams = z.infer<typeof sensorParams>
