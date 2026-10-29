import type { LoxoneProjectDto, ProjectRead } from "@lox-nexus/api"
import { ProjectReadError, type ProjectReader } from "@lox-nexus/loxone"
import { HttpError } from "../http/HttpError.ts"
import type { MiniserverService } from "./MiniserverService.ts"
import type { TimeZoneSetting } from "./TimeZoneSetting.ts"

/**
 * Reads a Loxone Config project for a configured Miniserver, from the Miniserver itself or from a
 * file the user uploads, so its intercommunication objects can be imported as signals. The
 * project's time zone is kept for the plugins (TimeZoneSetting); nothing else is stored.
 */
export class LoxoneProjectService {
  constructor(
    private readonly miniservers: Pick<MiniserverService, "get">,
    private readonly reader: Pick<ProjectReader, "read" | "file">,
    private readonly timeZone: Pick<TimeZoneSetting, "set">
  ) {}

  /**
   * Downloads the project from the Miniserver's host over FTP.
   * @throws HttpError 404 for an unknown Miniserver, 502 when the Miniserver can't be read (the message says why)
   */
  async read(miniserverId: string, login: ProjectRead): Promise<LoxoneProjectDto> {
    const { host } = this.miniservers.get(miniserverId)
    try {
      const { file, project } = await this.reader.read(host, login)
      return this.keep({ file, ...project })
    } catch (error) {
      if (error instanceof ProjectReadError) throw new HttpError(502, error.message)
      throw error
    }
  }

  /**
   * Reads an uploaded project file (`.Loxone`, `sps_….zip` or `.LoxCC`).
   * @throws HttpError 404 for an unknown Miniserver, 400 when the file isn't a readable project
   */
  readFile(miniserverId: string, name: string, data: Uint8Array): LoxoneProjectDto {
    this.miniservers.get(miniserverId)
    try {
      const { file, project } = this.reader.file(name, data)
      return this.keep({ file, ...project })
    } catch (error) {
      if (error instanceof ProjectReadError) throw HttpError.badRequest(error.message)
      throw error
    }
  }

  private keep(project: LoxoneProjectDto) {
    if (project.timeZone) this.timeZone.set(project.timeZone)
    return project
  }
}
