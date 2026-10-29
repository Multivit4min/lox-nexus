import { signalName, z } from "@lox-nexus/plugin-sdk"
import { Topic } from "../topics/Topic.ts"

/** what every actuator needs: where and how it publishes */
export const publishFields = {
  // a new signal is named after its topic
  // topics starting with $ are the broker's own ($SYS); clients mustn't publish there
  topic: signalName(Topic.nameSchema.refine(topic => !topic.startsWith("$"), "a topic starting with $ belongs to the broker")).meta({
    title: "Topic",
    description: "The exact topic to publish to, e.g. zigbee2mqtt/kitchen/plug/set; no wildcards"
  }),
  retain: z.boolean().default(false).meta({
    title: "Retain",
    description: "The broker keeps the last message and hands it to every new subscriber; for states, not for commands"
  }),
  qos: z.enum(["0", "1", "2"]).default("0").meta({
    title: "QoS",
    description: "Delivery guarantee between Nexus and the broker. 1 and 2 wait for the broker's confirmation",
    enumLabels: { 0: "0: at most once", 1: "1: at least once", 2: "2: exactly once" }
  })
}

export const publishParams = z.object(publishFields)

export type PublishParams = z.infer<typeof publishParams>
