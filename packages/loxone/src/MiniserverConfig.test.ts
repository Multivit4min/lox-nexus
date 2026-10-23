import assert from "node:assert/strict"
import { test } from "node:test"
import { IciSocket } from "@lox-nexus/ici"
import { MiniserverConfigSchema } from "./MiniserverConfig.ts"

test("both ports default to IciSocket.DEFAULT_PORT (61263)", () => {
  const config = MiniserverConfigSchema.parse({ id: "a", slug: "a", label: "", host: "h", ownId: "n", remoteId: "m" })
  assert.deepEqual([IciSocket.DEFAULT_PORT, config.port, config.listenPort], [61263, 61263, 61263])
})
