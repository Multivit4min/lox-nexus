import type { SchemaField } from "./SchemaField.ts"

/** A settings problem as the server reports it. */
export interface ConfigIssue {
  /** zod's path; symbols never occur in JSON, they are shown as text */
  path: ReadonlyArray<PropertyKey>
  message: string
}

/** Settings problems in the words of the form: "Devices › 2 › Name: too long". */
export class ConfigIssues {
  /** @param prefix the path the config sits under, "config" in a save's errors; the check route's start inside it */
  static describe(root: SchemaField | undefined, issues: readonly ConfigIssue[], prefix?: string): string[] {
    return issues.map(issue => {
      const path = prefix !== undefined && issue.path[0] === prefix ? issue.path.slice(1) : issue.path
      const where = ConfigIssues.labels(root, path)
      return where ? `${where}: ${issue.message}` : issue.message
    })
  }

  // field labels where the schema has them, list positions counted from 1
  private static labels(root: SchemaField | undefined, path: ReadonlyArray<PropertyKey>) {
    const parts: string[] = []
    let field = root
    for (const part of path) {
      if (typeof part === "number") {
        parts.push(String(part + 1))
        field = field?.items
        continue
      }
      field = field?.fields?.find(candidate => candidate.name === part)
      parts.push(field?.label || String(part))
    }
    return parts.join(" › ")
  }
}
