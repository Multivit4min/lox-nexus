import type { PluginSourceDto } from "@lox-nexus/api"
import type { Database } from "../Database.ts"

/** One installed version, as stored. */
export interface StoredVersion {
  pluginId: string
  version: string
  name: string
  icon?: string
  entry: string
  source: PluginSourceDto
  bundleSha256: string
  /** PluginDescription JSON; parsed (and re-described if stale) by PluginVersions */
  description: string
  installedAt: number
  installedBy: string
}

/** An installed plugin: its active version and the one before. */
export interface StoredPackage {
  id: string
  active: StoredVersion
  previous?: StoredVersion
}

interface VersionRow {
  plugin_id: string
  version: string
  name: string
  icon: string | null
  entry: string
  source_kind: "zip" | "git" | "local"
  source: string
  ref: string | null
  commit_sha: string | null
  archive_sha256: string | null
  bundle_sha256: string
  description: string
  installed_at: number
  installed_by: string
}

/** `plugin_packages` and `plugin_versions`: the source of truth for what is installed. */
export class PluginPackageRepository {
  constructor(private readonly db: Database) {}

  /** sorted by id */
  list(): StoredPackage[] {
    const ids = this.db.all<{ id: string }>("SELECT id FROM plugin_packages ORDER BY id")
    return ids.map(({ id }) => this.get(id)).filter(pkg => pkg !== undefined)
  }

  get(id: string): StoredPackage | undefined {
    const row = this.db.get<{ active_version: string; previous_version: string | null }>("SELECT active_version, previous_version FROM plugin_packages WHERE id = :id", { id })
    if (!row) return undefined
    const active = this.version(id, row.active_version)!
    const previous = row.previous_version === null ? undefined : this.version(id, row.previous_version)
    return { id, active, ...(previous ? { previous } : {}) }
  }

  /** every stored version, active or not; the loader deletes folders that have none */
  versions(): { pluginId: string; version: string }[] {
    return this.db.all<{ plugin_id: string; version: string }>("SELECT plugin_id, version FROM plugin_versions").map(row => ({ pluginId: row.plugin_id, version: row.version }))
  }

  /** adds the version and makes it active in one transaction; the old active one becomes previous */
  insert(version: StoredVersion) {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO plugin_versions (plugin_id, version, name, icon, entry, source_kind, source, ref, commit_sha, archive_sha256, bundle_sha256, description, installed_at, installed_by)
         VALUES (:pluginId, :version, :name, :icon, :entry, :kind, :source, :ref, :commit, :archive, :bundle, :description, :at, :by)`,
        PluginPackageRepository.params(version)
      )
      this.db.run(
        `INSERT INTO plugin_packages (id, active_version, previous_version) VALUES (:id, :version, NULL)
         ON CONFLICT (id) DO UPDATE SET previous_version = active_version, active_version = excluded.active_version`,
        { id: version.pluginId, version: version.version }
      )
    })
  }

  /** any stored version, active or not; undefined when there is none */
  version(pluginId: string, version: string) {
    const row = this.db.get<VersionRow>("SELECT * FROM plugin_versions WHERE plugin_id = :pluginId AND version = :version", { pluginId, version })
    return row && PluginPackageRepository.toVersion(row)
  }

  /** makes a stored version active; the one active before becomes previous (rollback and roll-forward alike) */
  activate(pluginId: string, version: string) {
    this.db.run(
      "UPDATE plugin_packages SET previous_version = active_version, active_version = :version WHERE id = :pluginId AND active_version <> :version",
      { pluginId, version }
    )
  }

  /** puts both pointers back exactly, e.g. after a switch that couldn't be applied */
  restore(pluginId: string, active: string, previous: string | undefined) {
    this.db.run("UPDATE plugin_packages SET active_version = :active, previous_version = :previous WHERE id = :pluginId", { pluginId, active, previous: previous ?? null })
  }

  /** a version that is neither active nor previous; the foreign keys refuse anything else */
  deleteVersion(pluginId: string, version: string) {
    this.db.run("DELETE FROM plugin_versions WHERE plugin_id = :pluginId AND version = :version", { pluginId, version })
  }

  /** after a stored description had to be described again */
  setDescription(pluginId: string, version: string, description: string) {
    this.db.run("UPDATE plugin_versions SET description = :description WHERE plugin_id = :pluginId AND version = :version", { pluginId, version, description })
  }

  /** the package and all its versions */
  delete(id: string) {
    this.db.transaction(() => {
      this.db.run("DELETE FROM plugin_packages WHERE id = :id", { id })
      this.db.run("DELETE FROM plugin_versions WHERE plugin_id = :id", { id })
    })
  }

  private static params(version: StoredVersion) {
    const { source } = version
    return {
      pluginId: version.pluginId, version: version.version, name: version.name, icon: version.icon ?? null, entry: version.entry,
      kind: source.kind,
      source: source.kind === "git" ? source.url : source.kind === "zip" ? source.fileName : source.folder,
      ref: source.kind === "git" ? source.ref : null,
      commit: source.kind === "git" ? source.commit : null,
      archive: source.kind === "zip" ? source.archiveSha256 : null,
      bundle: version.bundleSha256, description: version.description, at: version.installedAt, by: version.installedBy
    }
  }

  private static toVersion(row: VersionRow): StoredVersion {
    const source: PluginSourceDto = row.source_kind === "git"
      ? { kind: "git", url: row.source, ref: row.ref ?? "", commit: row.commit_sha ?? "" }
      : row.source_kind === "zip" ? { kind: "zip", fileName: row.source, archiveSha256: row.archive_sha256 ?? "" } : { kind: "local", folder: row.source }
    return {
      pluginId: row.plugin_id, version: row.version, name: row.name, ...(row.icon ? { icon: row.icon } : {}), entry: row.entry, source,
      bundleSha256: row.bundle_sha256, description: row.description, installedAt: row.installed_at, installedBy: row.installed_by
    }
  }
}
