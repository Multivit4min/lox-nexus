import type { Logger } from "pino"
import { GitProcess, type GitExit } from "./GitProcess.ts"
import { InstallError } from "./InstallError.ts"

/** How git is run; tests point `binary` at a fake and allow the file scheme. */
export interface GitRunnerOptions {
  binary?: string
  /** URL schemes git may use, default https only */
  protocols?: readonly string[]
  /** for one whole fetch (all its git calls together) */
  timeoutMs: number
}

/** One git call within a fetch. */
export interface GitCall {
  cwd: string
  /** the staging folder: HOME for git, and hidden from messages */
  home: string
  /** epoch ms by which the whole fetch must be done */
  deadline: number
  /** what stdout may hold; more kills git and fails with `tooLarge` */
  maxBytes?: number
  tooLarge?: string
  /** the clone, whose size is capped while git downloads into it */
  watch?: { dir: string; maxBytes: number }
}

/**
 * Runs git with a fixed, hardened setup: no system or user config, no prompts, no credential
 * helpers or hooks, only the allowed protocols, a minimal environment, a deadline that kills the
 * whole process group, and caps on what it may print and download.
 */
export class GitRunner {
  private readonly binary: string
  private readonly protocols: readonly string[]
  /** kills for the git processes running now, so a shutdown leaves none behind */
  private readonly running = new Set<() => void>()

  constructor(private readonly options: GitRunnerOptions, private readonly log: Logger) {
    this.binary = options.binary ?? "git"
    this.protocols = options.protocols ?? ["https"]
  }

  /** the time one fetch may take, for its deadline */
  get timeoutMs() {
    return this.options.timeoutMs
  }

  /** the options every call starts with */
  prefix() {
    return [
      // a manifest's entry is a path, never pathspec magic such as ":(glob)"
      "--literal-pathspecs",
      "-c", "protocol.allow=never",
      ...this.protocols.flatMap(protocol => ["-c", `protocol.${protocol}.allow=always`]),
      "-c", "credential.helper=",
      "-c", "core.hooksPath=/dev/null",
      "-c", "core.fsmonitor=false",
      "-c", "core.symlinks=false"
    ]
  }

  /** nothing inherited but PATH: no proxy, SSL, askpass or GIT_* variables reach git */
  environment(home: string): Record<string, string> {
    return {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      LC_ALL: "C",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ALLOW_PROTOCOL: this.protocols.join(":")
    }
  }

  /** @throws InstallError git-failed (with git's last error line), timeout, invalid-package, invalid-source or no-space */
  async run(args: string[], call: GitCall) {
    let kill: (() => void) | undefined
    const exit = await GitProcess.run(this.binary, [...this.prefix(), ...args], {
      cwd: call.cwd, env: this.environment(call.home), timeoutMs: Math.max(0, call.deadline - Date.now()),
      maxStdout: call.maxBytes ?? 1024 * 1024, ...(call.watch ? { watch: call.watch } : {})
    }, stop => this.running.add(kill = stop))
    if (kill) this.running.delete(kill)
    if (exit.code === 0 && !exit.killed && !exit.error) return exit.stdout
    const stderr = exit.stderr.replaceAll(call.home, "<staging>")
    this.log.debug({ args, stderr: stderr.slice(0, 2000), killed: exit.killed }, "git failed")
    throw this.failure(exit, args[0] ?? "git", stderr, call.tooLarge)
  }

  /** kills every running git process; for shutdown */
  stopAll() {
    for (const kill of this.running) kill()
  }

  private failure(exit: GitExit, command: string, stderr: string, tooLarge = "git printed too much") {
    if (exit.error?.code === "ENOENT") return new InstallError("git-failed", "git is not installed on the server")
    if (exit.killed === "stdout") return new InstallError("invalid-package", tooLarge)
    if (exit.killed === "store") return new InstallError("invalid-source", "the repository download is too large")
    if (exit.killed === "timeout") return new InstallError("timeout", `fetching from git took longer than ${this.options.timeoutMs / 1000} s`)
    if (exit.killed === "stopped") return new InstallError("git-failed", "the server is shutting down")
    if (/no space left on device|disk quota exceeded/i.test(stderr)) return new InstallError("no-space", "the server's disk is full")
    const last = stderr.trim().split("\n").filter(Boolean).at(-1)?.slice(0, 300)
    return new InstallError("git-failed", `git ${command} failed${last ? `: ${last}` : ""}`)
  }
}
