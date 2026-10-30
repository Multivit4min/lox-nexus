import assert from "node:assert/strict"
import { test } from "node:test"
import type { InstalledPluginDto, InstallOutcomeDto, RepositoryPluginDto } from "@lox-nexus/api"
import { InstallError } from "../plugins/install/InstallError.ts"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { PluginUpdateService, type PluginUpdateDeps } from "./PluginUpdateService.ts"

type Source = InstalledPluginDto["active"]["source"]

const plugin = (id: string, version: string, source: Source) => ({ id, name: id, active: { version, source } }) as unknown as InstalledPluginDto
const local: Source = { kind: "local", folder: "/repo/local" } as Source
const git = (url: string, commit: string): Source => ({ kind: "git", url, ref: "main", commit })

/** a package service with one local plugin that has an update, and whatever git plugins are given */
function setup(extra: InstalledPluginDto[] = [], overrides: Partial<PluginUpdateDeps> & { describeLocal?: PluginUpdateDeps["packages"]["describeLocal"] } = {}) {
  let now = 0
  const installed = [plugin("local", "1.0.0", local), ...extra]
  const installs: string[] = []
  // installs wait until released, so a second confirmation can arrive meanwhile
  let release = () => {}
  const gate = new Promise<void>(resolve => (release = resolve))
  const packages: PluginUpdateDeps["packages"] = {
    list: () => installed,
    repository: () => [{ id: "local", folder: "local", version: "1.1.0" } as RepositoryPluginDto],
    describeLocal: overrides.describeLocal ?? (async () => ({ version: "1.1.0", bundleSha256: "sha" })),
    updateLocal: async folder => {
      installs.push(folder)
      await gate
      return { plugin: plugin("local", "1.1.0", local) } as unknown as InstallOutcomeDto
    }
  }
  const service = new PluginUpdateService({ packages, git: { commit: async () => "new" }, log: LoggerFactory.silent(), now: () => now, batchMs: 1000, ...overrides })
  return { service, installed, installs, release, advance: (ms: number) => (now += ms) }
}

test("a review expires, and a second confirmation while one installs is refused as busy", async () => {
  const { service, installs, release, advance } = setup()
  const expired = await service.review(["local"], "admin")
  advance(1000)
  await assert.rejects(service.confirm(expired.batchId!, "admin"), (error: InstallError) => error.reason === "not-found")

  const [first, second] = [await service.review(["local"], "admin"), await service.review(["local"], "admin")]
  const running = service.confirm(first.batchId!, "admin")
  await assert.rejects(service.confirm(second.batchId!, "admin"), (error: InstallError) => error.reason === "busy")
  release()
  assert.deepEqual((await running).items.map(item => item.ok), [true])
  assert.deepEqual(installs, ["local"])
  assert.deepEqual((await service.confirm(second.batchId!, "admin")).items.map(item => item.ok), [true], "refused as busy, the review stays confirmable")
})

test("another install running fails the whole review as busy, not each plugin", async () => {
  const busy = new InstallError("busy", "another plugin install or uninstall is running")
  const { service } = setup([], {
    describeLocal: async () => {
      throw busy
    }
  })
  await assert.rejects(service.review(["local"], "admin"), busy)
})

test("git results count for the source they were asked for; checks at once are shared; uninstalled plugins are dropped", async () => {
  let asked = 0
  const { service, installed } = setup([plugin("remote", "1.0.0", git("https://a.example/p.git", "old"))], {
    git: {
      commit: async url => {
        asked++
        await Promise.resolve()
        if (url.includes("down")) throw new InstallError("git-failed", "unreachable")
        return "new"
      }
    }
  })
  const [one, two] = await Promise.all([service.checkGit(), service.checkGit()])
  assert.equal(asked, 1, "two checks at once ask once")
  assert.deepEqual(one, two)
  assert.deepEqual(one.updates.filter(update => update.source === "git").map(update => update.available), ["new"])

  // reinstalled from another server: the old answer is not about this source
  installed[1] = plugin("remote", "1.0.0", git("https://down.example/p.git", "old"))
  assert.deepEqual(service.updates().updates.filter(update => update.source === "git"), [])
  const checked = await service.checkGit()
  assert.deepEqual(checked.problems.map(problem => [problem.id, problem.problem]), [["remote", "unreachable"]])

  installed.pop()
  await service.checkGit()
  assert.equal((service as unknown as { remoteCommits: Map<string, unknown> }).remoteCommits.size, 0)
})
