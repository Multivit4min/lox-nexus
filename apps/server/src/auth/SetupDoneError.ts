/** Thrown when setup is attempted although a user already exists. */
export class SetupDoneError extends Error {
  constructor() {
    super("setup has already been completed")
  }
}
