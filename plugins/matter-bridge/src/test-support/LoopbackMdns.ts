import { Environment } from "@matter/main"

/**
 * Keeps the tests' mDNS on the loopback interface, so `npm test` doesn't announce test bridges to
 * the LAN (where an Echo could see them). matter.js reads the setting when its shared mDNS service
 * starts with the first node of the process, so call this before starting one.
 */
export class LoopbackMdns {
  static use() {
    Environment.default.vars.set("mdns.networkInterface", "lo")
  }
}
