import { readFileSync } from "node:fs"

/** The synthetic fixtures in test/fixtures, parsed afresh on every call so tests can change their copy. */
export class Fixtures {
  static load<T = unknown>(name: string): T {
    return JSON.parse(readFileSync(new URL(`../../test/fixtures/${name}.json`, import.meta.url), "utf8")) as T
  }
}

export type Json = Record<string, unknown>
