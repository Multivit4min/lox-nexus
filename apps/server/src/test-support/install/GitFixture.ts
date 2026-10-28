import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/** A local bare repository for the git tests, reached over file://, so no test needs the network. */
export class GitFixture {
  readonly bare: string
  private readonly work: string

  constructor(readonly root: string) {
    this.bare = path.join(root, "plugin.git")
    this.work = path.join(root, "work")
    fs.mkdirSync(this.work, { recursive: true })
    this.git(this.work, "init", "-q", "-b", "main")
    this.git(root, "init", "-q", "--bare", this.bare)
    this.git(this.bare, "config", "uploadpack.allowFilter", "true")
  }

  /** the file:// URL of the bare repository */
  get url() {
    return `file://${this.bare}`
  }

  /** writes the files, commits them, optionally tags the commit, and pushes; returns the commit */
  commit(files: Record<string, string | Buffer>, tag?: string) {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(this.work, name)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
    return this.finish(tag)
  }

  /** replaces `name` with a symbolic link to `target` (tree mode 120000) */
  symlink(name: string, target: string, tag?: string) {
    const file = path.join(this.work, name)
    fs.rmSync(file, { force: true })
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.symlinkSync(target, file)
    return this.finish(tag)
  }

  /** replaces `name` with a submodule entry (tree mode 160000) */
  submodule(name: string, tag?: string) {
    this.git(this.work, "rm", "-q", "--cached", "--ignore-unmatch", name)
    fs.rmSync(path.join(this.work, name), { force: true })
    this.git(this.work, "update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},${name}`)
    // no add -A: the gitlink has no folder on disk, so adding everything would drop it again
    return this.finish(tag, false)
  }

  private finish(tag?: string, addAll = true) {
    if (addAll) this.git(this.work, "add", "-A")
    this.git(this.work, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-q", "--allow-empty", "-m", "change")
    if (tag) this.git(this.work, "tag", tag)
    this.git(this.work, "push", "-q", "--force", "--tags", this.bare, "HEAD:main")
    return this.git(this.work, "rev-parse", "HEAD").trim()
  }

  private git(cwd: string, ...args: string[]) {
    return execFileSync("git", args, { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: this.root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } })
  }
}
