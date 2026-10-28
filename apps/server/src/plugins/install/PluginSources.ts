import type { GitInstallInput } from "@lox-nexus/api"
import type { GitRunner } from "./GitRunner.ts"
import { GitSource } from "./GitSource.ts"
import { GitUrl } from "./GitUrl.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import type { LocalRepository } from "./LocalRepository.ts"
import { LocalSource } from "./LocalSource.ts"
import { ZipSource } from "./ZipSource.ts"

/** Builds a source from what the client sent; input that can't name a usable source fails here, before any lock or folder. */
export class PluginSources {
  constructor(
    private readonly limits: InstallLimits,
    private readonly runner: GitRunner,
    readonly repository: LocalRepository,
    /** URL schemes allowed for git; tests add "file" */
    private readonly gitSchemes: readonly string[] = ["https"]
  ) {}

  /** @throws InstallError invalid-source for a URL or ref that isn't allowed */
  git(input: GitInstallInput) {
    return new GitSource(GitUrl.parse(input.url, input.ref, this.gitSchemes), this.runner, this.limits)
  }

  zip(data: Buffer, fileName: string) {
    return new ZipSource(data, fileName, this.limits)
  }

  /** @throws InstallError not-found, or invalid-package when the folder's plugin can't be installed */
  local(folder: string) {
    return new LocalSource(this.repository.find(folder), this.limits)
  }
}
