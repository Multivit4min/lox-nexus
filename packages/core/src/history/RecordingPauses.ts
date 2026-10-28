import type { PauseChange } from "./HistoryTypes.ts"

/**
 * Which signals the recorder is recording and which it paused, and the changes between the two
 * that still have to be written. A signal is recording from its first value; when it leaves the
 * selection it pauses, and its next value (or its return to the selection) resumes it. Without
 * the pauses a chart would draw the last value across the time nothing was recorded.
 */
export class RecordingPauses {
  private readonly recording = new Set<string>()
  private readonly paused: Set<string>
  private pending: PauseChange[] = []

  /** @param paused the signals paused in the store, so a pause outlives a restart */
  constructor(paused: string[]) {
    this.paused = new Set(paused)
  }

  /** the changes not written yet, oldest first */
  get changes(): readonly PauseChange[] {
    return this.pending
  }

  isRecording(signalId: string) {
    return this.recording.has(signalId)
  }

  isPaused(signalId: string) {
    return this.paused.has(signalId)
  }

  /** a value of the signal is recorded at `at`; resumes it if it was paused */
  started(signalId: string, at: number) {
    this.recording.add(signalId)
    if (this.paused.delete(signalId)) this.pending.push({ signalId, at, kind: "resume" })
  }

  /** the signal left the selection at `at`; pauses it if it was recording */
  stopped(signalId: string, at: number) {
    if (!this.recording.delete(signalId)) return
    this.paused.add(signalId)
    this.pending.push({ signalId, at, kind: "pause" })
  }

  /** a deleted signal: its history goes, so do its pauses */
  forget(signalId: string) {
    this.recording.delete(signalId)
    this.paused.delete(signalId)
    this.pending = this.pending.filter(change => change.signalId !== signalId)
  }

  /** the first `count` changes were written (or dropped) */
  done(count: number) {
    this.pending = this.pending.slice(count)
  }
}
