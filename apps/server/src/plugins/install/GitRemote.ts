import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { GitRunner } from "./GitRunner.ts"
import { GitUrl } from "./GitUrl.ts"
import { InstallError } from "./InstallError.ts"

/**
 * Asks a git server which commit a branch or tag points at now, without cloning: one
 * `git ls-remote`, with the runner's hardened setup and a short deadline. Used to tell whether a plugin
 * installed from git has a newer commit.
 */
export class GitRemote {
  /** one small request; a server that doesn't answer in this time counts as unreachable */
  static readonly DEADLINE_MS = 20_000

  constructor(private readonly git: GitRunner, private readonly schemes: readonly string[] = ["https"]) {}

  /**
   * @returns the commit the ref points at; for an annotated tag the commit it tags, as a clone gets it
   * @throws InstallError invalid-source, git-failed (also when the ref doesn't exist), timeout
   */
  async commit(url: string, ref: string): Promise<string> {
    const remote = GitUrl.parse(url, ref, this.schemes)
    // git wants a working folder and a HOME; an empty one of our own, removed afterwards
    const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lox-nexus-ls-remote-"))
    try {
      const output = await this.git.run(["ls-remote", "--", remote.url, remote.ref], { cwd: home, home, deadline: Date.now() + Math.min(GitRemote.DEADLINE_MS, this.git.timeoutMs), maxBytes: 64 * 1024 })
      return GitRemote.pick(output.toString(), remote.ref)
    } finally {
      await fs.promises.rm(home, { recursive: true, force: true })
    }
  }

  /** a branch before a tag of the same name, as `clone --branch` does; a tag's peeled line (^{}) wins */
  static pick(output: string, ref: string): string {
    const lines = output.split("\n").map(line => line.split("\t")).filter((parts): parts is [string, string] => parts.length === 2)
    const find = (name: string) => lines.find(([, refName]) => refName === name)?.[0]
    const commit = find(`refs/heads/${ref}`) ?? find(`refs/tags/${ref}^{}`) ?? find(`refs/tags/${ref}`)
    if (!commit || !/^[0-9a-f]{40,64}$/.test(commit)) throw new InstallError("git-failed", `the repository has no branch or tag "${ref}"`)
    return commit
  }
}
