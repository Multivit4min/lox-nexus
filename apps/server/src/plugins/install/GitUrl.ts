import { InstallError } from "./InstallError.ts"

/**
 * A repository URL and ref that are safe to hand to git. Only URLs the WHATWG parser accepts with
 * an allowed scheme pass, which rules out git's transport tricks (`ext::`, scp syntax, local
 * paths) and anything git could read as an option. Tokens in the URL are refused, so none is ever
 * stored or logged.
 */
export class GitUrl {
  private static readonly REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/

  private constructor(readonly url: string, readonly ref: string) {}

  /**
   * @param schemes allowed URL schemes without the colon; tests add "file"
   * @throws InstallError invalid-source
   */
  static parse(url: string, ref: string, schemes: readonly string[] = ["https"]) {
    return new GitUrl(GitUrl.checkUrl(url, schemes), GitUrl.checkRef(ref))
  }

  private static checkUrl(text: string, schemes: readonly string[]) {
    const fail = (why: string) => new InstallError("invalid-source", `the repository URL ${why}`)
    if (text.length > 2048) throw fail("is too long")
    if ([...text].some(char => /\s/.test(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) throw fail("must not contain spaces or control characters")
    if (text.startsWith("-")) throw fail("must not start with -")
    let url: URL
    try {
      url = new URL(text)
    } catch {
      throw fail(`must be a full ${schemes.join(" or ")} URL, e.g. https://github.com/owner/plugin.git`)
    }
    if (!schemes.includes(url.protocol.slice(0, -1))) throw fail(`must start with ${schemes.map(scheme => `${scheme}://`).join(" or ")}`)
    if (url.username || url.password) throw fail("must not contain a user name or token")
    // git has no use for them, and a token there would be stored and shown
    if (url.search || url.hash) throw fail("must not contain a query (?…) or fragment (#…)")
    if (url.protocol !== "file:" && !url.hostname) throw fail("needs a host")
    return url.href
  }

  private static checkRef(ref: string) {
    const ok = GitUrl.REF.test(ref) && !ref.includes("..") && !ref.includes("//") && !ref.includes("@{") && !ref.endsWith(".lock") && !ref.endsWith("/")
    if (!ok) throw new InstallError("invalid-source", "the branch or tag is not a valid name")
    return ref
  }
}
