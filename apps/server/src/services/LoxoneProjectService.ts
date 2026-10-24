import type { LoxoneProjectDto, ProjectRead } from "@lox-nexus/api"
import { ProjectReadError, type ProjectReader } from "@lox-nexus/loxone"
import { HttpError } from "../http/HttpError.ts"
import type { MiniserverService } from "./MiniserverService.ts"

/** Reads a configured Miniserver's Loxone Config project, so its intercommunication objects can be imported as signals. */
export class LoxoneProjectService {
  constructor(private readonly miniservers: Pick<MiniserverService, "get">, private readonly reader: Pick<ProjectReader, "read">) {}

  /**
   * Downloads the project from the Miniserver's host over FTP; nothing is stored.
   * @throws HttpError 404 for an unknown Miniserver, 502 when the Miniserver can't be read (the message says why)
   */
  async read(miniserverId: string, login: ProjectRead): Promise<LoxoneProjectDto> {
    const { host } = this.miniservers.get(miniserverId)
    try {
      const { file, project } = await this.reader.read(host, login)
      return { file, ...project }
    } catch (error) {
      if (error instanceof ProjectReadError) throw new HttpError(502, error.message)
      throw error
    }
  }
}
