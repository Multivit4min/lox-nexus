import type { RemoteInfo } from "node:dgram"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export interface CapturedDatagram {
  t: number
  from?: string
  hex: string
}

/** Loads JSONL captures from packages/ici/test/fixtures. */
export class Fixtures {
  private static readonly ROOT = join(import.meta.dirname, "../../test/fixtures")

  static lines<T = CapturedDatagram>(file: string): T[] {
    return readFileSync(join(Fixtures.ROOT, file), "utf8").trim().split("\n").map(line => JSON.parse(line) as T)
  }

  static datagrams(file: string): Buffer[] {
    return Fixtures.lines(file).filter(line => typeof line.hex === "string").map(line => Buffer.from(line.hex, "hex"))
  }

  static remote(port = 65534): RemoteInfo {
    return { address: "192.0.2.205", family: "IPv4", port, size: 0 }
  }
}
