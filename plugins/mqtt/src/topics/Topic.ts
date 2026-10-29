import { z } from "@lox-nexus/plugin-sdk"

/**
 * MQTT topic names and filters. A topic name is what a message is published to; a filter may
 * also hold the wildcards `+` (one level) and `#` (the rest, last level only).
 */
export class Topic {
  /** the protocol allows 65 535 bytes; nobody needs that, and every topic is held in memory */
  static readonly MAX_LENGTH = 1024

  /** an exact topic, as sensors and actuators use it */
  static readonly nameSchema = z.string()
    .min(1, "the topic is empty")
    .max(Topic.MAX_LENGTH)
    .refine(topic => !/[+#]/.test(topic), "an exact topic: no wildcards + or #")
    .refine(topic => !topic.includes("\u0000"), "no NUL characters")

  /** a filter with wildcards, as the catalog browses */
  static readonly filterSchema = z.string()
    .min(1)
    .max(Topic.MAX_LENGTH)
    .superRefine((filter, context) => {
      const problem = Topic.filterProblem(filter)
      if (problem) context.addIssue({ code: "custom", message: problem })
    })

  /** why a filter is invalid, or undefined */
  static filterProblem(filter: string): string | undefined {
    if (filter.includes("\u0000")) return "no NUL characters"
    const levels = filter.split("/")
    for (const [index, level] of levels.entries()) {
      if (level.includes("#") && (level !== "#" || index !== levels.length - 1)) return "# only as the whole last level, e.g. home/#"
      if (level.includes("+") && level !== "+") return "+ only as a whole level, e.g. home/+/temperature"
    }
    return undefined
  }

  /** whether a topic name matches a filter; `#` and `+` in the first level skip topics starting with `$` */
  static matches(filter: string, topic: string): boolean {
    const filterLevels = filter.split("/")
    const topicLevels = topic.split("/")
    if (topic.startsWith("$") && (filterLevels[0] === "#" || filterLevels[0] === "+")) return false
    for (const [index, level] of filterLevels.entries()) {
      if (level === "#") return true
      const actual = topicLevels[index]
      if (actual === undefined) return false
      if (level !== "+" && level !== actual) return false
    }
    return filterLevels.length === topicLevels.length
  }

  /** a level that can't hold wildcards: `+`, `#` and NUL become `_` */
  static safeLevel(level: string) {
    return level.replaceAll("+", "_").replaceAll("#", "_").replaceAll("\u0000", "_")
  }

  /** joins a base and a path, each level made safe; empty levels of the path are dropped */
  static join(base: string, path: string) {
    const levels = path.split("/").filter(level => level !== "").map(Topic.safeLevel)
    return [base, ...levels].join("/")
  }
}
