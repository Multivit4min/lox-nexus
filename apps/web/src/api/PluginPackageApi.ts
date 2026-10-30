import type {
  ActivateInput, BatchOutcomeDto, BatchReviewDto, GitInstallInput, InstallOutcomeDto, InstalledPluginDto, PluginReadmeDto, PluginUpdatesDto, RepositoryPluginDto,
  StagedInstallDto, UpdateImpactDto
} from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/**
 * /api/plugin-packages: installing, updating, rolling back and uninstalling plugins. Installs run
 * in two steps: stage (fetch, check and describe, which runs the plugin's code once) and confirm.
 */
export class PluginPackageApi {
  constructor(private readonly http: Http) {}

  list() {
    return this.http.get<InstalledPluginDto[]>("/api/plugin-packages")
  }

  /** the README of the version in use (or where it came from, see PluginReadmeDto), as Markdown; 404 when there is none */
  readme(id: string) {
    return this.http.get<PluginReadmeDto>(`/api/plugin-packages/${encodeURIComponent(id)}/readme`)
  }

  /** the plugins in the server's local plugin repository folder */
  repository() {
    return this.http.get<RepositoryPluginDto[]>("/api/plugin-packages/repository")
  }

  stageGit(input: GitInstallInput) {
    return this.http.post<StagedInstallDto>("/api/plugin-packages/stage/git", input)
  }

  stageLocal(folder: string) {
    return this.http.post<StagedInstallDto>("/api/plugin-packages/stage/local", { folder })
  }

  stageZip(file: File) {
    return this.http.upload<StagedInstallDto>(`/api/plugin-packages/stage/zip?${new URLSearchParams({ name: file.name })}`, file)
  }

  /** plugins with a newer version: the local repository at once, git from the last check */
  updates() {
    return this.http.get<PluginUpdatesDto>("/api/plugin-packages/updates")
  }

  /** asks each git plugin's server for its newest commit, then answers like updates() */
  checkUpdates() {
    return this.http.post<PluginUpdatesDto>("/api/plugin-packages/updates/check")
  }

  /** one review of updating these plugins from the local repository */
  reviewBatch(ids: string[]) {
    return this.http.post<BatchReviewDto>("/api/plugin-packages/batch", { ids })
  }

  /** installs what the review showed; the batch id is only valid once */
  confirmBatch(batchId: string) {
    return this.http.post<BatchOutcomeDto>(`/api/plugin-packages/batch/${encodeURIComponent(batchId)}/confirm`, {})
  }

  /** @param expectedActive the active version the review showed, null for a new plugin */
  confirm(stagingId: string, expectedActive: string | null) {
    return this.http.post<InstallOutcomeDto>(`/api/plugin-packages/stage/${encodeURIComponent(stagingId)}/confirm`, { expectedActive })
  }

  discard(stagingId: string) {
    return this.http.delete(`/api/plugin-packages/stage/${encodeURIComponent(stagingId)}`)
  }

  /** what switching to a stored version would do */
  impact(id: string, version: string) {
    return this.http.get<UpdateImpactDto>(`${this.url(id)}/versions/${encodeURIComponent(version)}/impact`)
  }

  /** switches to the previous version (rollback) or back */
  activate(id: string, input: ActivateInput) {
    return this.http.post<InstallOutcomeDto>(`${this.url(id)}/activate`, input)
  }

  /** refused (409) while instances of the plugin exist */
  uninstall(id: string) {
    return this.http.delete(this.url(id))
  }

  private url(id: string) {
    return `/api/plugin-packages/${encodeURIComponent(id)}`
  }
}
