import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer, type AddressInfo } from "node:net"
import { describe, test } from "node:test"
import { FakeFtpServer, type FakeFtpBehaviour } from "../test-support/FakeFtpServer.ts"
import { ProjectFixtures } from "../test-support/ProjectFixtures.ts"
import { MiniserverFtp } from "./MiniserverFtp.ts"
import { ProjectReadError } from "./ProjectReadError.ts"

const login = { username: "claude", password: "secret" }

/** runs a download against a fake server with this behaviour, closing it afterwards */
async function download(behaviour: FakeFtpBehaviour, deadlineMs = 5000) {
  const server = new FakeFtpServer(behaviour)
  const port = await server.listen()
  try {
    return await new MiniserverFtp({ port, timeoutMs: 2000, deadlineMs }).download("127.0.0.1", login)
  } finally {
    await server.close()
  }
}

const readError = (pattern: RegExp) => (error: unknown) => error instanceof ProjectReadError && pattern.test(error.message)

describe("MiniserverFtp against a fake FTP server", { timeout: 10_000 }, () => {
  test("downloads the newest project file from /prog", async () => {
    const newest = ProjectFixtures.zip()
    const result = await download({
      files: { "sps_0273_20260828123416.zip": Buffer.from("old"), "sps_0274_20261024142743.zip": newest, "Default.Loxone": Buffer.from("x") }
    })
    assert.equal(result.name, "sps_0274_20261024142743.zip")
    assert.deepEqual(new Uint8Array(result.data), newest)
  })

  test("a refused login explains itself and warns about the Miniserver's ban", async () => {
    await assert.rejects(download({ refuseLogin: true }), readError(/refused the FTP login.*block this server's address/))
  })

  test("no project file in /prog", async () => {
    await assert.rejects(download({ files: { "Default.Loxone": Buffer.from("x") } }), readError(/no project file in \/prog/))
  })

  test("a server that hangs up mid-session is a ProjectReadError, not an internal error", async () => {
    await assert.rejects(download({ hangUpOn: "PASS" }), readError(/127\.0\.0\.1/))
  })

  test("a file larger than MAX_BYTES is refused while downloading", async () => {
    const huge = Buffer.alloc(MiniserverFtp.MAX_BYTES + 1)
    await assert.rejects(download({ files: { "sps_0274_20261024142743.zip": huge } }), readError(/larger than expected/))
  })

  test("a closed port says FTP may be off", async () => {
    const probe = createServer().listen(0, "127.0.0.1")
    await once(probe, "listening")
    const port = (probe.address() as AddressInfo).port
    probe.close()
    await once(probe, "close")
    await assert.rejects(new MiniserverFtp({ port }).download("127.0.0.1", login), readError(/refuses FTP connections/))
  })

  test("the overall deadline stops a read that takes too long", async () => {
    await assert.rejects(download({ hangUpOn: "never", files: { "sps_1_20260101000000.zip": ProjectFixtures.zip() } }, 1), readError(/took longer than/))
  })
})
