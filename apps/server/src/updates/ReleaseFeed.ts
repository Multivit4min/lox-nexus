import { VersionChange } from "@lox-nexus/api"
import { z } from "zod"

/** A published release of Nexus on GitHub. */
export interface Release {
  version: string
  tag: string
  /** the release's page */
  url: string
  /** where the files at that tag are, for the changelog's relative links */
  filesUrl: string
  publishedAt?: number
}

const ReleaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable().optional()
})

/**
 * Reads Nexus's releases and changelog from its GitHub repository, without a token: GitHub
 * allows 60 such requests an hour per address. A check is one, or two when there is a newer
 * release. Only the version tag is taken from an answer; links are built from it, so an answer
 * can't put a link of its own into the page.
 */
export class ReleaseFeed {
  static readonly REPOSITORY = "Multivit4min/lox-nexus"
  static readonly TIMEOUT_MS = 10_000
  /** the changelog is about 50 KB today; a much larger answer isn't one */
  static readonly MAX_BYTES = 2 * 1024 * 1024
  // stable releases only; the tag also goes into URLs, so nothing else gets through
  private static readonly TAG = /^v?(\d+\.\d+\.\d+)$/

  constructor(private readonly fetcher: typeof fetch, private readonly userAgent = "lox-nexus") {}

  /** the newest release that is neither a draft nor a pre-release; undefined when there is none */
  async latest(signal?: AbortSignal): Promise<Release | undefined> {
    const answer: unknown = JSON.parse(await this.get(`https://api.github.com/repos/${ReleaseFeed.REPOSITORY}/releases?per_page=30`, "application/vnd.github+json", signal))
    if (!Array.isArray(answer)) throw new Error("GitHub's answer isn't a list of releases")
    // one odd entry doesn't spoil the others
    const releases = answer.flatMap(entry => {
      const parsed = ReleaseSchema.safeParse(entry)
      const version = parsed.success ? ReleaseFeed.TAG.exec(parsed.data.tag_name)?.[1] : undefined
      if (!parsed.success || !version || parsed.data.draft || parsed.data.prerelease) return []
      const published = parsed.data.published_at ? Date.parse(parsed.data.published_at) : NaN
      return [{ ...ReleaseFeed.links(parsed.data.tag_name), version, tag: parsed.data.tag_name, ...(Number.isFinite(published) ? { publishedAt: published } : {}) }]
    })
    return releases.sort((a, b) => VersionChange.compare(b.version, a.version))[0]
  }

  /** CHANGELOG.md as it is at a release's tag */
  changelog(release: Pick<Release, "tag">, signal?: AbortSignal) {
    return this.get(`https://raw.githubusercontent.com/${ReleaseFeed.REPOSITORY}/${encodeURIComponent(release.tag)}/CHANGELOG.md`, "text/plain", signal)
  }

  private static links(tag: string) {
    const base = `https://github.com/${ReleaseFeed.REPOSITORY}`
    return { url: `${base}/releases/tag/${encodeURIComponent(tag)}`, filesUrl: `${base}/blob/${encodeURIComponent(tag)}/` }
  }

  /** @throws Error with a message for the System page */
  private async get(url: string, accept: string, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(ReleaseFeed.TIMEOUT_MS)
    const response = await this.fetcher(url, {
      headers: { accept, "user-agent": this.userAgent },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    }).catch((error: unknown) => {
      throw new Error(`can't reach GitHub: ${ReleaseFeed.reason(error)}`)
    })
    if (response.status === 403 || response.status === 429) throw new Error("GitHub limits how often it is asked; Nexus tries again later")
    if (!response.ok) throw new Error(`GitHub answered ${response.status} ${response.statusText}`)
    return ReleaseFeed.capped(response)
  }

  // counted while it arrives: a chunked answer has no length to check up front
  private static async capped(response: Response) {
    if (Number(response.headers.get("content-length") ?? 0) > ReleaseFeed.MAX_BYTES) throw new Error("GitHub's answer is too large")
    const chunks: Uint8Array[] = []
    let size = 0
    // leaving the loop early cancels the stream, so the rest is never downloaded
    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength
      if (size > ReleaseFeed.MAX_BYTES) break
      chunks.push(chunk)
    }
    if (size > ReleaseFeed.MAX_BYTES) throw new Error("GitHub's answer is too large")
    return new TextDecoder().decode(Buffer.concat(chunks))
  }

  // fetch keeps the useful part ("getaddrinfo ENOTFOUND") in the error's cause
  private static reason(error: unknown) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) return "no answer"
    return cause instanceof Error ? cause.message : String(cause)
  }
}
