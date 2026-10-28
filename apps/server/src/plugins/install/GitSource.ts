import fs from "node:fs"
import path from "node:path"
import type { GitCall, GitRunner } from "./GitRunner.ts"
import type { GitUrl } from "./GitUrl.ts"
import { InstallError } from "./InstallError.ts"
import type { InstallLimits } from "./InstallLimits.ts"
import { ManifestValidator } from "./ManifestValidator.ts"
import { PackageWriter } from "./PackageWriter.ts"
import type { FetchedPackage, PluginSource } from "./PluginSource.ts"

/**
 * A branch or tag of a git repository. The clone is shallow, has no working tree and fetches
 * blobs only when read, so nothing of the repository is checked out: no symlinks, no
 * .gitattributes filters, no hooks. The two files are read as blobs, after checking that they
 * are plain files in the tree.
 */
export class GitSource implements PluginSource {
  private static readonly FILE_MODES = new Set(["100644", "100755"])

  constructor(private readonly repository: GitUrl, private readonly git: GitRunner, private readonly limits: InstallLimits) {}

  async fetch(packageDir: string): Promise<FetchedPackage> {
    const staging = path.dirname(packageDir)
    const clone = path.join(staging, "git")
    const { url, ref } = this.repository
    // one deadline and one size cap for the whole fetch: every call may download
    const call: GitCall = { cwd: clone, home: staging, deadline: Date.now() + this.git.timeoutMs, watch: { dir: clone, maxBytes: this.limits.gitStoreBytes } }
    await this.git.run([
      "clone", "--depth", "1", "--single-branch", "--no-tags", "--no-recurse-submodules", "--filter=blob:none", "--no-checkout",
      `--branch=${ref}`, "--", url, clone
    ], { ...call, cwd: staging })
    try {
      const commit = (await this.git.run(["rev-parse", "HEAD"], call)).toString().trim()
      if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new InstallError("git-failed", "git returned no commit")
      const manifestBytes = await this.blob(call, "package.json", this.limits.manifestBytes)
      const manifest = ManifestValidator.parse(manifestBytes)
      const bundle = await this.blob(call, manifest.entry, this.limits.bundleBytes)
      if (bundle.subarray(0, 40).toString().startsWith("version https://git-lfs")) {
        throw new InstallError("invalid-package", "the bundle is stored with Git LFS, which the installer doesn't fetch; commit it as a normal file")
      }
      const map = await this.mode(call, `${manifest.entry}.map`) ? await this.blob(call, `${manifest.entry}.map`, this.limits.bundleBytes) : undefined
      await this.checkStoreSize(clone)
      await PackageWriter.write(packageDir, manifest, { manifest: manifestBytes, bundle, ...(map ? { map } : {}) })
      return { origin: { kind: "git", url, ref, commit }, manifest }
    } finally {
      await fs.promises.rm(clone, { recursive: true, force: true })
    }
  }

  /** the tree mode of `file` at HEAD, undefined when it isn't there */
  private async mode(call: GitCall, file: string) {
    const line = (await this.git.run(["ls-tree", "HEAD", "--", file], call)).toString().split("\n")[0]
    return line ? line.split(/\s/)[0] : undefined
  }

  // reading the blob fetches it: the watched clone size caps the download, maxBytes what git prints
  private async blob(call: GitCall, file: string, maxBytes: number) {
    const mode = await this.mode(call, file)
    if (!mode) throw new InstallError("invalid-package", `"${file}" is not in the repository at that branch or tag`)
    if (!GitSource.FILE_MODES.has(mode)) throw new InstallError("invalid-package", `"${file}" must be a plain file, not a symbolic link, folder or submodule`)
    const tooLarge = `"${file}" is larger than ${Math.round(maxBytes / 1024)} KiB`
    const bytes = await this.git.run(["cat-file", "blob", `HEAD:${file}`], { ...call, maxBytes, tooLarge })
    if (bytes.length > maxBytes) throw new InstallError("invalid-package", tooLarge)
    return bytes
  }

  private async checkStoreSize(clone: string) {
    let total = 0
    for (const entry of await fs.promises.readdir(path.join(clone, ".git"), { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) total += (await fs.promises.stat(path.join(entry.parentPath, entry.name))).size
    }
    if (total > this.limits.gitStoreBytes) throw new InstallError("invalid-source", "the repository download is too large")
  }
}
