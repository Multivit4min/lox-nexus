import type { DiagnosticsSampleDto } from "@lox-nexus/api"

type NumberKey = { [K in keyof DiagnosticsSampleDto]: DiagnosticsSampleDto[K] extends number ? K : never }[keyof DiagnosticsSampleDto]

const FIELDS: NumberKey[] = [
  "rss", "heapUsed", "heapTotal", "external", "arrayBuffers", "cpuPercent", "loopDelayP50", "loopDelayP99", "loopDelayMax", "loopUtilization",
  "busPerSecond", "retainedTopics", "streamClients", "wires", "databaseBytes", "historyBytes", "pluginsBytes"
]

/**
 * The samples as one CSV table, a row per sample: the time (ISO), the process's figures, then
 * columns per plugin worker and per Miniserver as they appear in any sample (empty where one
 * didn't run). Columns are named by label, so the file reads without Nexus.
 */
export class DiagnosticsCsv {
  write(samples: DiagnosticsSampleDto[]): string {
    const workers = DiagnosticsCsv.distinct(samples.flatMap(sample => sample.workers.map(worker => [worker.instanceId, worker.label] as const)))
    const miniservers = DiagnosticsCsv.distinct(samples.flatMap(sample => sample.miniservers.map(ms => [ms.id, ms.label] as const)))
    const header = [
      "time", ...FIELDS,
      ...workers.flatMap(([, label]) => [`${label} heapUsed`, `${label} heapTotal`, `${label} utilization`]),
      ...miniservers.flatMap(([, label]) => [`${label} in/s`, `${label} out/s`])
    ].map(DiagnosticsCsv.inert)
    const rows = samples.map(sample => {
      const worker = (id: string) => sample.workers.find(candidate => candidate.instanceId === id)
      const ms = (id: string) => sample.miniservers.find(candidate => candidate.id === id)
      return [
        new Date(sample.ts).toISOString(), ...FIELDS.map(field => sample[field]),
        ...workers.flatMap(([id]) => [worker(id)?.heapUsed, worker(id)?.heapTotal, worker(id)?.utilization]),
        ...miniservers.flatMap(([id]) => [ms(id)?.incomingPerSecond, ms(id)?.outgoingPerSecond])
      ]
    })
    return [header, ...rows].map(row => row.map(DiagnosticsCsv.cell).join(",")).join("\r\n") + "\r\n"
  }

  // the latest label of each id, in order of first appearance
  private static distinct(pairs: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
    const labels = new Map<string, string>()
    for (const [id, label] of pairs) labels.set(id, label)
    return [...labels]
  }

  // a name like "=cmd()" would run as a formula in a spreadsheet
  private static inert(text: string) {
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  }

  private static cell(value: unknown) {
    if (value === undefined || value === null) return ""
    const text = String(value)
    return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text
  }
}
