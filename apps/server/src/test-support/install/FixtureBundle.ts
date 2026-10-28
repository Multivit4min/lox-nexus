import { fileURLToPath } from "node:url"
import { build } from "esbuild"

/** The built fixture plugin: its bundle and a package.json for it. */
export class FixtureBundle {
  private static readonly built = new Map<1 | 2, Promise<Buffer>>()

  /**
   * The bundle, built once per test process with esbuild (the SDK bundled in, like a real plugin).
   * Version 2 drops sensor "b" and accepts negative start values.
   */
  static bundle(version: 1 | 2 = 1) {
    let built = FixtureBundle.built.get(version)
    if (!built) {
      built = build({
        entryPoints: [fileURLToPath(new URL(version === 1 ? "./FixturePlugin.ts" : "./FixturePluginV2.ts", import.meta.url))],
        bundle: true, platform: "node", format: "esm", target: "node24", conditions: ["@lox-nexus/source"], write: false, logLevel: "silent"
      }).then(result => Buffer.from(result.outputFiles[0]!.contents))
      FixtureBundle.built.set(version, built)
    }
    return built
  }

  /** package.json text; `loxNexus` fields are merged, other fields replace */
  static manifest(overrides: Record<string, unknown> = {}, loxNexus: Record<string, unknown> = {}) {
    return JSON.stringify({
      name: "lox-nexus-plugin-fixture", version: "1.0.0", type: "module", ...overrides,
      loxNexus: { apiVersion: 1, id: "fixture", name: "Fixture", entry: "dist/plugin.js", icon: "test", ...loxNexus }
    }, null, 2)
  }
}
