import assert from "node:assert/strict"

/** waits for a condition that depends on network events, checking every millisecond up to a deadline */
export async function waitFor(condition: () => boolean, message = "condition not met", timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1))
  assert.ok(condition(), message)
}
