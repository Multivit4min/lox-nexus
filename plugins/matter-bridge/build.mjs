// Bundles the plugin into one ESM file, like the other plugins, with what matter.js needs:
// - not minified: matter.js relies on class names
// - bun:sqlite replaced by a stub: matter.js imports its Bun driver statically; Node never uses it
// - the createRequire banner: some dependencies call require() for Node built-ins
// - the licenses of every bundled package in dist/THIRD-PARTY-LICENSES.txt (matter.js is Apache-2.0)
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = dirname(fileURLToPath(import.meta.url))
const quiet = process.argv.includes("--log-level=warning")

const noBun = {
  name: "no-bun",
  setup(builder) {
    builder.onResolve({ filter: /^bun:/ }, args => ({ path: args.path, namespace: "no-bun" }))
    builder.onLoad({ filter: /.*/, namespace: "no-bun" }, () => ({
      contents: "export const Database = undefined; export const constants = {}; export default {}",
      loader: "js"
    }))
  }
}

const result = await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(root, "dist/plugin.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  conditions: ["@lox-nexus/source"],
  plugins: [noBun],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: "eof",
  metafile: true,
  logLevel: "warning"
})

/** the directory of every bundled package below node_modules (input paths are relative to the working directory) */
function bundledPackages(inputs) {
  const directories = new Set()
  for (const input of inputs) {
    const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)
    if (match) directories.add(resolve(match[1]))
  }
  return [...directories].sort()
}

const sections = bundledPackages(Object.keys(result.metafile.inputs)).map(directory => {
  const { name, version, license } = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
  const file = ["LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE"].map(candidate => join(directory, candidate)).filter(existsSync)
  return `${name} ${version} (${license})\n\n${file.map(path => readFileSync(path, "utf8").trim()).join("\n\n")}`
})
writeFileSync(join(root, "dist/THIRD-PARTY-LICENSES.txt"), `Packages bundled into plugin.js and their licenses.\n\n${sections.join(`\n\n${"=".repeat(78)}\n\n`)}\n`)
if (!quiet) process.stdout.write(`dist/plugin.js: ${(Object.values(result.metafile.outputs)[0]?.bytes ?? 0) / 1e6} MB, ${sections.length} bundled packages\n`)
