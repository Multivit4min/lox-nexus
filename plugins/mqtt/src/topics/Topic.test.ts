import assert from "node:assert/strict"
import { test } from "node:test"
import { Topic } from "./Topic.ts"

test("filters match like a broker matches them", () => {
  const cases: [string, string, boolean][] = [
    ["#", "a/b/c", true],
    ["#", "$SYS/broker", false],
    ["+/b", "$SYS/b", false],
    ["$SYS/#", "$SYS/broker/uptime", true],
    ["a/#", "a", true],
    ["a/#", "a/b/c", true],
    ["a/+/c", "a/b/c", true],
    ["a/+/c", "a/b/d", false],
    ["a/+", "a/b/c", false],
    ["a/b", "a/b", true],
    ["a/b", "a/b/c", false],
    ["+", "/", false],
    ["+/+", "/", true]
  ]
  for (const [filter, topic, expected] of cases) assert.equal(Topic.matches(filter, topic), expected, `${filter} ${topic}`)
})

test("filters: # only as the whole last level, + only as a whole level", () => {
  for (const filter of ["#", "a/#", "+/b/+", "a/b"]) assert.equal(Topic.filterProblem(filter), undefined, filter)
  for (const filter of ["a/#/b", "a#", "a/b+", "a/\u0000"]) assert.ok(Topic.filterProblem(filter), filter)
})

test("join: levels made safe, empty levels dropped", () => {
  assert.equal(Topic.join("base", "loxone/home/in/t"), "base/loxone/home/in/t")
  assert.equal(Topic.join("b", "/a//b+#/"), "b/a/b__")
})
