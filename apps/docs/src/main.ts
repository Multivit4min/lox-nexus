// Builds the documentation site into apps/docs/dist. `--watch` rebuilds when the content, the
// assets or the plugins' READMEs change.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DocsBuilder } from "./DocsBuilder.ts"
import { MarkdownRenderer } from "./MarkdownRenderer.ts"

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const paths = {
  content: path.join(docs, "content"),
  assets: path.join(docs, "src", "assets"),
  out: path.resolve(process.env.DOCS_OUT_DIR ?? path.join(docs, "dist")),
  repository: path.resolve(docs, "..", "..")
}
const builder = new DocsBuilder(paths, await MarkdownRenderer.create())

const build = () => {
  const started = Date.now()
  const pages = builder.build()
  console.log(`docs: ${pages} pages in ${Date.now() - started} ms → ${paths.out}`)
}

if (!process.argv.includes("--watch")) {
  build()
} else {
  const rebuild = () => {
    try {
      build()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
  }
  rebuild()
  let pending: NodeJS.Timeout | undefined
  const schedule = () => {
    clearTimeout(pending)
    pending = setTimeout(rebuild, 200)
  }
  for (const dir of [paths.content, paths.assets, path.join(paths.repository, "plugins")]) fs.watch(dir, { recursive: true }, schedule)
}
