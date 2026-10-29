import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { PayloadGuess } from "./PayloadGuess.ts"
import type { CachedTopic } from "./TopicCache.ts"

/** a node while the tree is built: children by level name */
interface Branch {
  label: string
  children: Map<string, Branch>
  entries: CatalogEntry[]
}

/**
 * The browsed topics as a tree of their levels: `home/kitchen/temperature` is the entry
 * "temperature" in home › kitchen. A JSON topic is a node of its own with an entry per field.
 * At most MAX_ENTRIES entries, so a huge broker still gives an answer the UI can show.
 */
export class CatalogTree {
  static readonly MAX_ENTRIES = 20_000
  private readonly root: Branch = { label: "", children: new Map(), entries: [] }
  private count = 0

  /** whether entries were left out because of MAX_ENTRIES */
  truncated = false

  add(cached: CachedTopic) {
    const guess = PayloadGuess.of(cached)
    const levels = cached.topic.split("/")
    const entries = guess.kind === "json" ? guess.entries : [guess.entry]
    if (this.count + entries.length > CatalogTree.MAX_ENTRIES) {
      this.truncated = true
      return
    }
    this.count += entries.length
    // a plain topic sits in its parent's node (a top-level one in a node of its own)
    const path = guess.kind === "json" || levels.length === 1 ? levels : levels.slice(0, -1)
    this.branch(path).entries.push(...entries)
  }

  nodes(): CatalogNode[] {
    return [...this.root.children.values()].map(branch => CatalogTree.node(branch))
  }

  private branch(levels: string[]) {
    let branch = this.root
    for (const level of levels) {
      let child = branch.children.get(level)
      if (!child) {
        child = { label: level === "" ? "(empty)" : level, children: new Map(), entries: [] }
        branch.children.set(level, child)
      }
      branch = child
    }
    return branch
  }

  private static node(branch: Branch): CatalogNode {
    const node: CatalogNode = { label: branch.label }
    if (branch.children.size > 0) node.children = [...branch.children.values()].map(child => CatalogTree.node(child))
    if (branch.entries.length > 0) node.entries = branch.entries
    return node
  }
}
