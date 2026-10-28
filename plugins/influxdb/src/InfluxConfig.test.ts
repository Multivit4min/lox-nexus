import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { influxConfigSchema } from "./InfluxConfig.ts"
import { InfluxPlugin } from "./InfluxPlugin.ts"

type Field = { title?: string; description?: string; writeOnly?: boolean; enumLabels?: Record<string, string>; default?: unknown }
type Schema = { properties?: Record<string, Field> }

const v2 = { url: "http://influx.local:8086", org: "home", bucket: "loxone", token: "t" }

/** the issues of a config as "path: message" */
function issues(config: unknown) {
  const result = influxConfigSchema.safeParse(config)
  return result.success ? [] : result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`)
}

test("every form field has a title and a description; secrets stay secret; the api choices are named", async () => {
  const description = await PluginTestHost.describe(InfluxPlugin)
  const fields = (description.config as Schema).properties ?? {}
  assert.equal(fields.url?.title, "URL")
  for (const [key, field] of Object.entries(fields)) {
    assert.ok(field.title, `${key} has a title`)
    assert.ok(field.description, `${key} has a description`)
  }
  assert.deepEqual(fields.api?.enumLabels, { v2: "InfluxDB 2 or 3 (token)", v1: "InfluxDB 1 (user and password)" })
  assert.deepEqual(Object.keys(fields).filter(key => fields[key]?.writeOnly), ["token", "password"])
  assert.deepEqual(description.watches, { label: "Exported signals", description: "Values of these signals are written to InfluxDB" })
  assert.deepEqual([description.sensors, description.actuators], [[], []])
})

test("defaults", () => {
  const config = influxConfigSchema.parse(v2)
  assert.deepEqual(
    [config.api, config.measurement, config.tagTopic, config.tagLabel, config.tagOwner, config.flushSeconds, config.batchSize, config.maxBufferedPoints, config.writeInitial, config.gzip],
    ["v2", "lox_nexus", true, true, true, 5, 5000, 25_000, true, true]
  )
})

test("the fields of the chosen api are required", () => {
  assert.deepEqual(issues({ url: v2.url }), [
    "org: Organization is required for InfluxDB 2 or 3 (token)",
    "bucket: Bucket is required for InfluxDB 2 or 3 (token)",
    "token: API token is required for InfluxDB 2 or 3 (token)"
  ])
  assert.deepEqual(issues({ ...v2, token: "" }), ["token: API token is required for InfluxDB 2 or 3 (token)"])
  assert.deepEqual(issues({ url: v2.url, api: "v1" }), ["database: Database is required for InfluxDB 1 (user and password)"])
  assert.deepEqual(issues({ url: v2.url, api: "v1", database: "loxone" }), [], "user and password are optional")
})

test("URLs must be http(s) without credentials; the batch must fit the buffer", () => {
  assert.equal(issues({ ...v2, url: "ftp://influx" }).length, 1)
  assert.deepEqual(issues({ ...v2, url: "http://admin:pw@influx:8086" }), ["url: put the user and password into their own fields, not into the URL"])
  assert.deepEqual(issues({ ...v2, batchSize: 5000, maxBufferedPoints: 1000 }), ["batchSize: Batch size must not exceed the buffer"])
})

test("an invalid config fails the start with the reason", async () => {
  await assert.rejects(PluginTestHost.start(InfluxPlugin, { config: { url: v2.url } }), /Organization is required/)
})

test("tokens and users must fit a header; measurements can't start a comment; names are trimmed", () => {
  assert.deepEqual(issues({ ...v2, token: "s3cret\ntoken" }), ["token: only visible ASCII characters, no spaces"])
  assert.deepEqual(issues({ ...v2, token: "a b" }), ["token: only visible ASCII characters, no spaces"])
  assert.deepEqual(issues({ url: v2.url, api: "v1", database: "db", username: "a:b" }), ["username: must not contain a colon"])
  assert.deepEqual(issues({ url: v2.url, api: "v1", database: "db", username: "nö" }), ["username: only visible ASCII characters, no spaces"])
  assert.deepEqual(issues({ ...v2, measurement: "#lox" }), ["measurement: must not start with #"])
  const config = influxConfigSchema.parse({ ...v2, org: " home ", bucket: "loxone\n", token: " t ", database: " db " })
  assert.deepEqual([config.org, config.bucket, config.token, config.database], ["home", "loxone", "t", "db"])
})

test("a token a header can't carry never shows in the start error", async () => {
  const error = await PluginTestHost.start(InfluxPlugin, { config: { ...v2, token: "s3cret\ntoken" } }).then(() => undefined, (e: unknown) => e)
  assert.ok(error instanceof Error)
  assert.match(error.message, /visible ASCII/)
  assert.equal(error.message.includes("s3cret"), false)
})
