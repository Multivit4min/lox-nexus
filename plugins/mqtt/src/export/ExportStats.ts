/** Counters of the export, for the panel. In memory only. */
export class ExportStats {
  published = 0
  /** null values, values of signals not in the watch list */
  skipped = 0
  /** publishes that failed (the connection was lost on the way) */
  failed = 0
  /** values Nexus left out because the export fell behind (`dropped` of watched()) */
  droppedByNexus = 0
  /** retained messages removed for signals no longer exported */
  cleared = 0
  lastPublishedAt: number | undefined
}
