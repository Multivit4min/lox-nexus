/**
 * The ids of catalog nodes the panel's "Signals" buttons point at; the API's own ids, which stay
 * the same between the panel and the catalog read a moment later.
 */
export class CatalogIds {
  static client(id: string) {
    return `client:${id}`
  }

  static device(id: string) {
    return `device:${id}`
  }

  static port(deviceId: string, idx: number) {
    return `port:${deviceId}:${idx}`
  }

  static wifi(id: string) {
    return `wifi:${id}`
  }
}
