import type { AccessScope } from "@lox-nexus/api"
import type { ToolContext } from "./ToolContext.ts"

/** A family of resources, e.g. nexus://miniservers/{slug}/loxone-side; each {name} stands for one path segment. */
export interface McpResourceTemplate {
  readonly uriTemplate: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly mimeType: "text/plain" | "application/json" | "text/markdown"
  readonly scope: AccessScope
  read(params: Record<string, string>, context: ToolContext): unknown
}

/** Matches a URI against a template, segment by segment. */
export class UriTemplate {
  /** the variables, or undefined when the URI doesn't fit */
  static match(template: string, uri: string): Record<string, string> | undefined {
    const pattern = template.split(/(\{[a-z]+\})/i).map(part => {
      const name = /^\{([a-z]+)\}$/i.exec(part)?.[1]
      return name ? `(?<${name}>[^/?#]+)` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }).join("")
    const groups = new RegExp(`^${pattern}$`).exec(uri)?.groups
    if (!groups) return undefined
    try {
      return Object.fromEntries(Object.entries(groups).map(([name, value]) => [name, decodeURIComponent(value)]))
    } catch {
      return undefined
    }
  }
}
