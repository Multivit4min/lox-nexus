import { Topic } from "../topics/Topic.ts"

/** what the cache keeps of a topic */
export interface CachedTopic {
  topic: string
  /** the start of the last payload, at most MAX_PAYLOAD characters */
  payload: string
  /** whether `payload` was cut */
  clipped: boolean
  retained: boolean
}

/**
 * The last payload of each topic seen while browsing, bounded: at most `limit` topics (the one
 * heard of longest ago goes first) and MAX_PAYLOAD characters each, so a busy broker can't fill
 * the worker's memory (the old integration kept every topic forever).
 */
export class TopicCache {
  static readonly MAX_PAYLOAD = 1024
  private readonly topics = new Map<string, CachedTopic>()
  /** topics dropped to stay within the limit, since the last clear */
  evicted = 0

  constructor(readonly limit: number) {}

  get size() {
    return this.topics.size
  }

  record(topic: string, payload: Buffer, retained: boolean) {
    // a name longer than a sensor accepts can't be offered, and would cost up to 64 KiB of memory each
    if (topic.length > Topic.MAX_LENGTH) return
    this.topics.delete(topic)
    // an empty retained message deletes the topic's retained value
    if (payload.length === 0) return
    const text = payload.subarray(0, TopicCache.MAX_PAYLOAD * 4).toString("utf8")
    const clipped = text.length > TopicCache.MAX_PAYLOAD || payload.length > TopicCache.MAX_PAYLOAD * 4
    this.topics.set(topic, { topic, payload: text.slice(0, TopicCache.MAX_PAYLOAD), clipped, retained })
    if (this.topics.size <= this.limit) return
    const oldest = this.topics.keys().next()
    if (!oldest.done) this.topics.delete(oldest.value)
    this.evicted++
  }

  /** every topic, sorted */
  list(): CachedTopic[] {
    return [...this.topics.values()].sort((a, b) => (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0))
  }

  clear() {
    this.topics.clear()
    this.evicted = 0
  }
}
