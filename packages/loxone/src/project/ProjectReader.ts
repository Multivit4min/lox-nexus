import type { IntercomProject } from "./IntercomProject.ts"
import { IntercomProjectParser } from "./IntercomProjectParser.ts"
import type { DownloadedProject, FtpCredentials } from "./MiniserverFtp.ts"
import { ProjectFiles } from "./ProjectFiles.ts"
import { ProjectReadError } from "./ProjectReadError.ts"

/** A project read from a Miniserver, with the file it came from. */
export interface ReadProject {
  /** e.g. "sps_0274_20261024142743.zip" */
  file: string
  project: IntercomProject
}

/** where the project file comes from; MiniserverFtp in production */
export interface ProjectSource {
  download(host: string, credentials: FtpCredentials): Promise<DownloadedProject>
}

/** Downloads a Miniserver's current Loxone Config project and reads its intercommunication setup. */
export class ProjectReader {
  constructor(private readonly source: ProjectSource) {}

  /** @throws ProjectReadError for anything the user can fix or should know about */
  async read(host: string, credentials: FtpCredentials): Promise<ReadProject> {
    const { name, data } = await this.source.download(host, credentials)
    const xml = ProjectFiles.xml(name, data)
    try {
      return { file: name, project: IntercomProjectParser.parse(xml) }
    } catch (error) {
      throw new ProjectReadError(`"${name}" is not a readable project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
