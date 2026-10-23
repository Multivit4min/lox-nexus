/** Saving and opening JSON files in the browser, without a server round trip for the file itself. */
export class JsonFile {
  /** offers the data as a download */
  static save(name: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = Object.assign(document.createElement("a"), { href: url, download: name })
    link.click()
    // the click starts the download synchronously; revoking later keeps slow browsers happy
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /** @throws SyntaxError with a readable message for a file that isn't JSON */
  static async read(file: File): Promise<unknown> {
    try {
      return JSON.parse(await file.text()) as unknown
    } catch {
      throw new SyntaxError(`${file.name} is not a JSON file`)
    }
  }
}
