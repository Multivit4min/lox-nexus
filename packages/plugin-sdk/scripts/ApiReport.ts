// Writes the SDK's API reports (api/*.api.md), or with --check fails when the public API differs
// from them. Run by `npm run api:report` and, in CI, `npm run api:check` (ADR 0019).
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor"

/** One export path of package.json and the report that records it. */
interface EntryPoint {
  /** relative to src/, e.g. "wire/index.d.ts" */
  declarations: string
  /** e.g. "plugin-sdk.wire.api.md" */
  report: string
}

/**
 * The public API of each export path as API Extractor records it: every export with its
 * signature, but no implementation and no private members. Declarations are emitted into a
 * temporary folder first, as the package isn't built to dist/ in the repository.
 */
export class ApiReport {
  private readonly sdk = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

  /** read from package.json "exports", so a new export path can't go unrecorded */
  entryPoints(): EntryPoint[] {
    const { exports } = JSON.parse(fs.readFileSync(path.join(this.sdk, "package.json"), "utf8")) as { exports: Record<string, { "@lox-nexus/source": string }> }
    return Object.entries(exports).map(([subpath, targets]) => ({
      declarations: path.relative("src", targets["@lox-nexus/source"]).replace(/\.ts$/, ".d.ts"),
      report: `plugin-sdk${subpath === "." ? "" : `.${subpath.slice(2)}`}.api.md`
    }))
  }

  /** @returns the reports that differ from the API; none when writing them */
  run(check: boolean): EntryPoint[] {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-api-"))
    // a check writes nothing: a missing report counts as changed
    if (!check) fs.mkdirSync(path.join(this.sdk, "api"), { recursive: true })
    try {
      this.emitDeclarations(temp)
      return this.entryPoints().filter(entry => this.extract(entry, temp, check))
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  }

  private emitDeclarations(out: string) {
    const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc")
    // an explicit root, so the layout under `out` matches the entry points even if a file outside src/ joins the program
    const args = [tsc, "-p", this.sdk, "--noEmit", "false", "--declaration", "--emitDeclarationOnly", "--rootDir", path.join(this.sdk, "src"), "--outDir", out]
    try {
      execFileSync(process.execPath, args, { stdio: "inherit" })
    } catch {
      throw new Error("tsc couldn't emit the SDK's declarations; see its output above")
    }
  }

  /** @returns whether the report differs from the API */
  private extract({ declarations, report }: EntryPoint, temp: string, check: boolean) {
    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder: this.sdk,
        mainEntryPointFilePath: path.join(temp, declarations),
        // the SDK's own settings (which allow the ".ts" specifiers the declarations keep), over the emitted files
        compiler: { overrideTsconfig: { extends: "./tsconfig.json", include: [temp] } },
        apiReport: { enabled: true, reportFileName: report, reportFolder: path.join(this.sdk, "api"), reportTempFolder: path.join(temp, "reports") },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        newlineKind: "lf",
        // release tags and doc completeness are API Extractor's publishing conventions, not ours
        messages: { extractorMessageReporting: { default: { logLevel: ExtractorLogLevel.None } }, tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } } }
      },
      configObjectFullPath: undefined,
      packageJsonFullPath: path.join(this.sdk, "package.json")
    })
    // the temporary report is gone after the run, so a check prints the difference itself
    const result = Extractor.invoke(config, { localBuild: !check, printApiReportDiff: check })
    if (result.errorCount > 0) throw new Error(`API Extractor failed for ${declarations}`)
    return check && result.apiReportChanged
  }
}

try {
  const changed = new ApiReport().run(process.argv.includes("--check"))
  if (changed.length > 0) {
    console.error(`The SDK's public API changed: ${changed.map(entry => entry.report).join(", ")}.`)
    console.error("If that is intended, run `npm run api:report` and commit the reports (see docs/adr/0019). JSDoc changes count too.")
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
