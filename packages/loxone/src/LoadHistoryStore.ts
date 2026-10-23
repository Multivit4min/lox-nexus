import type { LoadSample } from "./IntercomLoad.ts"

/**
 * Where a Miniserver's load samples survive a restart. The server keeps them in its database;
 * without a store the history lives in memory only. Implementations must not throw from append():
 * it runs in a timer, so a failing write should be logged and skipped.
 */
export interface LoadHistoryStore {
  /** samples newer than `since` (epoch ms), oldest first */
  load(miniserverId: string, since: number): LoadSample[]
  /** stores one sample and may drop samples older than `keepSince` */
  append(miniserverId: string, sample: LoadSample, keepSince: number): void
}
