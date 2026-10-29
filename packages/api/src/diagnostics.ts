/** One plugin instance's worker at a sample, for GET /api/diagnostics. */
export interface DiagnosticsWorkerDto {
  instanceId: string
  label: string
  /** bytes */
  heapUsed: number
  heapTotal: number
  /** share of the time its event loop was busy since the previous sample, 0 to 1 */
  utilization: number
}

/** One Miniserver's intercommunication traffic at a sample. */
export interface DiagnosticsMiniserverDto {
  id: string
  label: string
  incomingPerSecond: number
  outgoingPerSecond: number
}

/** What the Nexus process looked like at one moment; byte sizes are bytes, times milliseconds. */
export interface DiagnosticsSampleDto {
  /** epoch ms */
  ts: number
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
  /** CPU time of the whole process (all threads) since the previous sample, in percent of one core */
  cpuPercent: number
  /** event loop delay since the previous sample */
  loopDelayP50: number
  loopDelayP99: number
  loopDelayMax: number
  /** share of the time the main event loop was busy since the previous sample, 0 to 1 */
  loopUtilization: number
  /** bus messages per second since the previous sample */
  busPerSecond: number
  retainedTopics: number
  streamClients: number
  wires: number
  /** bytes on disk, write-ahead logs included */
  databaseBytes: number
  historyBytes: number
  pluginsBytes: number
  workers: DiagnosticsWorkerDto[]
  miniservers: DiagnosticsMiniserverDto[]
}

/** GET /api/diagnostics: the process and its samples, oldest first. */
export interface DiagnosticsDto {
  /** epoch ms when the process started */
  startedAt: number
  version: string
  node: string
  platform: string
  /** between two samples */
  intervalMs: number
  /** how far back samples are kept (in memory, so a restart starts afresh) */
  keepMs: number
  samples: DiagnosticsSampleDto[]
}
