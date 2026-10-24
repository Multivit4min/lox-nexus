import assert from "node:assert/strict"

/** waits for a condition that depends on network events, checking every millisecond up to a deadline (not a turn count, which a loaded machine runs through too fast) */
export async function waitFor(condition: () => boolean, message = "condition not met", timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1))
  assert.ok(condition(), message)
}

/** resource types that are active now beyond what `baseline` had (counted per type) */
export function newResources(baseline: string[]) {
  const counts = new Map<string, number>()
  for (const type of baseline) counts.set(type, (counts.get(type) ?? 0) + 1)
  const added: string[] = []
  for (const type of process.getActiveResourcesInfo()) {
    const left = counts.get(type) ?? 0
    if (left > 0) counts.set(type, left - 1)
    else added.push(type)
  }
  return added
}
