import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/** Why a git process was killed. */
export type GitKill = "timeout" | "stdout" | "store" | "stopped"

/** How one git process ended. */
export interface GitExit {
  stdout: Buffer
  stderr: string
  code: number | null
  /** set when we killed it */
  killed?: GitKill
  /** spawning failed, e.g. ENOENT when git isn't installed */
  error?: NodeJS.ErrnoException
}

/** Limits of one git process. */
export interface GitProcessOptions {
  cwd: string
  env: Record<string, string>
  timeoutMs: number
  /** more on stdout kills it */
  maxStdout: number
  /** a folder whose size is watched while git runs; growing past `maxBytes` kills it */
  watch?: { dir: string; maxBytes: number }
}

/**
 * One git process in its own process group. Git starts helpers for lazy fetches (`cat-file` on a
 * partial clone runs `git fetch`, which runs upload-pack), so killing only the process we started
 * would leave the download running; every kill goes to the whole group.
 */
export class GitProcess {
  /** how often the watched folder is measured */
  static readonly WATCH_MS = 250

  private constructor() {}

  /** @param stop receives a function that kills the process early (server shutdown) */
  static run(binary: string, argv: string[], options: GitProcessOptions, stop?: (kill: () => void) => void): Promise<GitExit> {
    return new Promise(resolve => {
      const child = spawn(binary, argv, { cwd: options.cwd, env: options.env, detached: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
      const stdout: Buffer[] = []
      let bytes = 0
      let stderr = ""
      let killed: GitKill | undefined
      const kill = (why: GitKill) => {
        killed ??= why
        GitProcess.killGroup(child.pid)
      }
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > options.maxStdout) kill("stdout")
        else stdout.push(chunk)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 8_000) stderr += chunk.toString()
      })
      const timer = setTimeout(() => kill("timeout"), options.timeoutMs)
      const watch = options.watch && setInterval(() => void GitProcess.overSize(options.watch!).then(over => over && kill("store")), GitProcess.WATCH_MS)
      stop?.(() => kill("stopped"))
      let settled = false
      const finish = (code: number | null, error?: NodeJS.ErrnoException) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearInterval(watch)
        // helpers that outlive their parent (a failed cat-file's fetch) go with it
        GitProcess.killGroup(child.pid)
        resolve({ stdout: Buffer.concat(stdout), stderr, code, ...(killed ? { killed } : {}), ...(error ? { error } : {}) })
      }
      child.on("error", error => finish(null, error))
      child.on("close", code => finish(code))
    })
  }

  private static killGroup(pid: number | undefined) {
    if (pid === undefined) return
    try {
      process.kill(-pid, "SIGKILL")
    } catch {
      // the group is gone already
    }
  }

  private static async overSize(watch: { dir: string; maxBytes: number }) {
    let total = 0
    try {
      for (const entry of await fs.promises.readdir(watch.dir, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) total += (await fs.promises.stat(path.join(entry.parentPath, entry.name)).catch(() => undefined))?.size ?? 0
      }
    } catch {
      return false
    }
    return total > watch.maxBytes
  }
}
