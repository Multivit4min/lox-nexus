/** Thrown when setup is attempted although a user already exists. */
export class SetupDoneError extends Error {
  /** answered as 409 by ErrorHandler */
  constructor() {
    super("setup has already been completed")
  }
}
