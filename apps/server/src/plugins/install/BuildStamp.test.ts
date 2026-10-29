import assert from "node:assert/strict"
import { test } from "node:test"
import { BuildStamp } from "./BuildStamp.ts"

test("the version gets the bundle's hash; one with build metadata stays as its author stamped it", () => {
  const a = BuildStamp.version("0.1.0", Buffer.from("export default 1"))
  assert.match(a, /^0\.1\.0\+[0-9a-f]{8}$/)
  assert.equal(BuildStamp.version("0.1.0", Buffer.from("export default 1")), a, "same bundle, same stamp")
  assert.notEqual(BuildStamp.version("0.1.0", Buffer.from("export default 2")), a)
  assert.equal(BuildStamp.version("1.0.0+ci.42", Buffer.from("x")), "1.0.0+ci.42")
})

test("package.json keeps everything but the version", () => {
  const written = BuildStamp.manifest(Buffer.from(JSON.stringify({ name: "p", version: "0.1.0", loxNexus: { id: "p" } })), "0.1.0+abcdef12")
  assert.deepEqual(JSON.parse(written.toString("utf8")), { name: "p", version: "0.1.0+abcdef12", loxNexus: { id: "p" } })
})

test("the README counts too: an edited README is a new version, none keeps the bundle's stamp as before", () => {
  const bundle = Buffer.from("export default 1")
  const plain = BuildStamp.version("0.1.0", bundle)
  assert.equal(BuildStamp.version("0.1.0", bundle, undefined), plain)
  const documented = BuildStamp.version("0.1.0", bundle, Buffer.from("# Plugin\n"))
  assert.notEqual(documented, plain)
  assert.equal(BuildStamp.version("0.1.0", bundle, Buffer.from("# Plugin\n")), documented)
  assert.notEqual(BuildStamp.version("0.1.0", bundle, Buffer.from("# Plugin, edited\n")), documented)
})
