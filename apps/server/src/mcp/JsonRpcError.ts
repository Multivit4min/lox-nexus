/** An error the dispatcher answers as a JSON-RPC error rather than a tool result. */
export class JsonRpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message)
    this.name = "JsonRpcError"
  }
}
