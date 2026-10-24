/**
 * Reading a project from a Miniserver failed for a reason the user can act on: unreachable,
 * wrong login, no project stored, or a file that can't be decoded. The message says which.
 */
export class ProjectReadError extends Error {
  override readonly name = "ProjectReadError"
}
