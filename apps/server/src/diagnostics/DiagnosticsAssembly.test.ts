import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import type { DiagnosticsDto } from "@lox-nexus/api"
import { EventBus } from "@lox-nexus/core"
import type { FastifyInstance } from "fastify"
import type { Config } from "../config/Config.ts"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { DiagnosticsAssembly, type DiagnosedApp } from "./DiagnosticsAssembly.ts"
import { DiagnosticsSampler } from "./DiagnosticsSampler.ts"

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve))
}

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.parse("2026-10-29T10:00:00Z") }))
afterEach(() => mock.timers.reset())

/** reads the sampler through the controller, as the page does */
const read = (assembly: DiagnosticsAssembly) => {
  let route: (() => DiagnosticsDto) | undefined
  assembly.controller().register({ get: (path: string, handler: (request: { query: object }) => DiagnosticsDto) => {
    if (path === "/api/diagnostics") route = () => handler({ query: {} })
  } } as unknown as FastifyInstance)
  return route!()
}

test("a worker that never answers is left out after 5 s; the others and later samples go on", async t => {
  const supervisor = (id: string, stats: () => Promise<unknown>) => ({ config: { id, label: id }, stats })
  const app = {
    bus: new EventBus(), wires: { list: () => [] }, miniservers: { list: () => [] }, streams: undefined,
    persistence: { db: { file: undefined } }, history: { database: { db: { file: undefined } } },
    plugins: { list: () => [
      supervisor("stuck", () => new Promise(() => {})),
      supervisor("failing", () => Promise.reject(new Error("gone"))),
      supervisor("fine", async () => ({ heapUsed: 1, heapTotal: 2, utilization: 0.123456789 }))
    ] }
  } as unknown as DiagnosedApp
  const assembly = new DiagnosticsAssembly(app, { pluginsDir: "/nonexistent" } as Config, { now: () => Date.now() }, LoggerFactory.silent())
  t.after(() => assembly.dispose())
  for (let round = 0; round < 2; round++) {
    mock.timers.tick(DiagnosticsSampler.INTERVAL_MS)
    await settle()
    mock.timers.tick(DiagnosticsAssembly.WORKER_TIMEOUT_MS)
    await settle()
  }
  const { samples } = read(assembly)
  assert.equal(samples.length, 2, "the stuck worker held up neither sample")
  assert.deepEqual(samples.map(sample => sample.workers.map(worker => [worker.instanceId, worker.utilization])), [[["fine", 0.1235]], [["fine", 0.1235]]])
})
