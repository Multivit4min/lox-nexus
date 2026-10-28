import { fileURLToPath } from "node:url"
import { build } from "esbuild"

/** The built fixture plugin: its bundle and a package.json for it. */
export class FixtureBundle {
  private static built: Promise<Buffer> | undefined

  /** the bundle, built once per test process with esbuild (the SDK bundled in, like a real plugin) */
  static bundle() {
    FixtureBundle.built ??= build({
      entryPoints: [fileURLToPath(new URL("./FixturePlugin.ts", import.meta.url))],
      bundle: true, platform: "node", format: "esm", target: "node24", conditions: ["@lox-nexus/source"], write: false, logLevel: "silent"
    }).then(result => Buffer.from(result.outputFiles[0]!.contents))
    return FixtureBundle.built
  }

  /** package.json text; `loxNexus` fields are merged, other fields replace */
  static manifest(overrides: Record<string, unknown> = {}, loxNexus: Record<string, unknown> = {}) {
    return JSON.stringify({
      name: "lox-nexus-plugin-fixture", version: "1.0.0", type: "module", ...overrides,
      loxNexus: { apiVersion: 1, id: "fixture", name: "Fixture", entry: "dist/plugin.js", icon: "test", ...loxNexus }
    }, null, 2)
  }
}
