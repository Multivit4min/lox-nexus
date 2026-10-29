import type {
  ActivateInput, GitInstallInput, InstallOutcomeDto, InstalledPluginDto, RepositoryPluginDto, StagedInstallDto, UpdateImpactDto
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

  /** the README of the version in use, as Markdown; 404 when the plugin has none */
  readme(id: string) {
    return this.http.get<{ markdown: string }>(`/api/plugin-packages/${encodeURIComponent(id)}/readme`)
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
