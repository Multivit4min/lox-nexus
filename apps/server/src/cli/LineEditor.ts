/**
 * Turns raw terminal keystrokes into lines, for a prompt that doesn't echo. Enter (\r, \n or a
 * \r\n split across reads) ends a line; text typed or pasted after it waits for the next prompt.
 * Backspace deletes a whole character (also an emoji). Escape sequences (arrow keys, function
 * keys) and other control characters are dropped, since a browser can't type them. Ctrl-C and
 * Ctrl-D cancel.
 */
export class LineEditor {
  private typed = ""
  private escape: "none" | "start" | "csi" | "ss3" = "none"
  private afterReturn = false
  /** finished lines; null for a cancel */
  private readonly finished: Array<string | null> = []

  feed(chunk: string) {
    for (const char of chunk) this.key(char)
  }

  /** the next finished line, null when cancelled, undefined while still typing */
  take(): string | null | undefined {
    return this.finished.shift()
  }

  private key(char: string) {
    const afterReturn = this.afterReturn
    this.afterReturn = false
    if (this.escape !== "none") return this.inEscape(char)
    if (char === "\n" && afterReturn) return
    if (char === "\r" || char === "\n") {
      this.finished.push(this.typed)
      this.typed = ""
      this.afterReturn = char === "\r"
    } else if (char === "\u0003" || char === "\u0004") {
      this.finished.push(null)
    } else if (char === "\u007f" || char === "\b") {
      this.typed = Array.from(this.typed).slice(0, -1).join("")
    } else if (char === "\u001b") {
      this.escape = "start"
    } else if (char >= " ") {
      this.typed += char
    }
  }

  /** ESC [ params final (CSI), ESC O x (SS3), or ESC plus one character */
  private inEscape(char: string) {
    if (this.escape === "start") this.escape = char === "[" ? "csi" : char === "O" ? "ss3" : "none"
    else if (this.escape === "ss3" || (char >= "@" && char <= "~")) this.escape = "none"
  }
}
