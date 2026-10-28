import { test } from "node:test"

test("module loads", async () => {
  await import("./index.ts")
})
