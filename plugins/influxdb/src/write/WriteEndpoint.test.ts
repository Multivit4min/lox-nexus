import assert from "node:assert/strict"
import { test } from "node:test"
import type { InfluxConfig } from "../InfluxConfig.ts"
import { influxConfigSchema } from "../InfluxConfig.ts"
import { WriteEndpoint } from "./WriteEndpoint.ts"

test("a token a header can't carry fails when the endpoint is built, without quoting it", () => {
  // the schema refuses such a token; this is the second line of defence
  const config: InfluxConfig = { ...influxConfigSchema.parse({ url: "http://influx:8086", org: "o", bucket: "b", token: "t" }), token: "s3cret\ntoken" }
  assert.throws(() => WriteEndpoint.fromConfig(config), (error: Error) => !error.message.includes("s3cret") && /can't carry/.test(error.message))
})

test("the description names the target without credentials", () => {
  const config = influxConfigSchema.parse({ url: "https://influx:8086/proxy", org: "o", bucket: "b", token: "s3cret" })
  const endpoint = WriteEndpoint.fromConfig(config)
  assert.equal(endpoint.description, "https://influx:8086/proxy · org o · bucket b")
  assert.equal(endpoint.url.href, "https://influx:8086/proxy/api/v2/write?org=o&bucket=b&precision=ms")
  assert.equal(endpoint.healthUrl.href, "https://influx:8086/proxy/health")
})
