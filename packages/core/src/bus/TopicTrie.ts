import { Topic } from "./Topic.ts"

class TrieNode<T> {
  readonly children = new Map<string, TrieNode<T>>()
  readonly items = new Set<T>()
}

/** Maps topic patterns (with + and #) to items and finds all items matching a concrete topic. */
export class TopicTrie<T> {
  private readonly root = new TrieNode<T>()

  add(pattern: string, item: T) {
    Topic.assertValidPattern(pattern)
    let node = this.root
    for (const segment of pattern.split("/")) {
      let child = node.children.get(segment)
      if (!child) {
        child = new TrieNode<T>()
        node.children.set(segment, child)
      }
      node = child
    }
    node.items.add(item)
  }

  remove(pattern: string, item: T) {
    const path: Array<[TrieNode<T>, string]> = []
    let node: TrieNode<T> | undefined = this.root
    for (const segment of pattern.split("/")) {
      const child: TrieNode<T> | undefined = node.children.get(segment)
      if (!child) return
      path.push([node, segment])
      node = child
    }
    node.items.delete(item)
    this.prune(path, node)
  }

  match(topic: string): T[] {
    const found = new Set<T>()
    this.collect(this.root, topic.split("/"), 0, found)
    return [...found]
  }

  private collect(node: TrieNode<T>, segments: string[], index: number, found: Set<T>) {
    node.children.get("#")?.items.forEach(item => found.add(item))
    if (index === segments.length) {
      node.items.forEach(item => found.add(item))
      return
    }
    const exact = node.children.get(segments[index]!)
    if (exact) this.collect(exact, segments, index + 1, found)
    const single = node.children.get("+")
    if (single) this.collect(single, segments, index + 1, found)
  }

  private prune(path: Array<[TrieNode<T>, string]>, leaf: TrieNode<T>) {
    let node = leaf
    for (const [parent, segment] of path.reverse()) {
      if (node.items.size > 0 || node.children.size > 0) return
      parent.children.delete(segment)
      node = parent
    }
  }
}
