/** Sizes as people read them: "412 B", "3.4 KiB", "1.2 MiB". */
export class ByteSize {
  static format(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
  }
}
