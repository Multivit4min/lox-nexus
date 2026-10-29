import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { Plugin } from "vite"

/**
 * Rewrites `import { Bell, X } from "@lucide/vue"` into one import per icon file. The package's
 * index re-exports about 1900 icons, and the bundler loads and parses every one of them before tree
 * shaking drops those not used: most of the build's modules and much of its memory, enough to get a
 * Docker build on a small host killed. The names come from the index's own export lines, so aliases
 * (`XIcon`, `Unlock`) resolve as they do there; an import naming anything else is left alone.
 */
export class LucideImports {
  static readonly PACKAGE = "@lucide/vue"
  private static readonly IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@lucide\/vue["'];?/g
  private readonly files = new Map<string, string>()

  /** @param index the text of the package's ESM index (dist/esm/lucide-vue.mjs) */
  constructor(index: string) {
    for (const [, names, file] of index.matchAll(/export\s*\{([^}]*)\}\s*from\s*'\.\/icons\/([^']+)'/g)) {
      for (const [, name] of (names ?? "").matchAll(/default as (\w+)/g)) if (name && file) this.files.set(name, file)
    }
  }

  static fromPackage(from = import.meta.url) {
    const root = path.dirname(createRequire(from).resolve(`${LucideImports.PACKAGE}/package.json`))
    return new LucideImports(fs.readFileSync(path.join(root, "dist", "esm", "lucide-vue.mjs"), "utf8"))
  }

  get size() {
    return this.files.size
  }

  /** the code with every icon import split per file, or undefined when there is nothing to change */
  rewrite(code: string): string | undefined {
    let changed = false
    const out = code.replace(LucideImports.IMPORT, (statement, list: string) => {
      const imports: string[] = []
      for (const specifier of list.split(",").map(part => part.trim()).filter(Boolean)) {
        // types exist only for the type checker, which still reads the original import
        if (specifier.startsWith("type ")) continue
        const [name = "", local = name] = specifier.split(/\s+as\s+/)
        const file = this.files.get(name)
        if (!file) return statement
        imports.push(`import ${local} from "${LucideImports.PACKAGE}/dist/esm/icons/${file}"`)
      }
      changed = true
      // one line, so the lines after it keep their numbers in errors and stack traces
      return `${imports.join("; ")};`
    })
    return changed ? out : undefined
  }

  /** the Vite plugin: before Vue compiles single-file components, for the app's own sources */
  plugin(): Plugin {
    return {
      name: "lucide-imports",
      enforce: "pre",
      transform: (code, id) => {
        if (id.includes("node_modules") || !/\.(vue|ts)$/.test(id.split("?")[0] ?? "")) return undefined
        const rewritten = this.rewrite(code)
        return rewritten === undefined ? undefined : { code: rewritten, map: null }
      }
    }
  }
}
