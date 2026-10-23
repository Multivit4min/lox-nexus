import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_ICI_PORT, MiniserverInputSchema } from "./miniservers.ts"

test("both ports default to Loxone's intercommunication port 61263", () => {
  const input = MiniserverInputSchema.parse({ slug: "haus", label: "Haus", host: "10.0.0.2", ownId: "nexus", remoteId: "ms" })
  assert.deepEqual([DEFAULT_ICI_PORT, input.port, input.listenPort], [61263, 61263, 61263])
})
