import assert from "node:assert/strict"
import { test } from "node:test"
import { MacAddress } from "./api/MacAddress.ts"
import { CertificateFingerprint } from "./config/CertificateFingerprint.ts"
import { ConsoleAddress } from "./config/ConsoleAddress.ts"
import { VoucherText } from "./vouchers/VoucherText.ts"

test("console addresses: a host gets the documented local base, a URL path replaces it", () => {
  assert.equal(ConsoleAddress.parse("192.0.2.1").url("/v1/info").href, "https://192.0.2.1/proxy/network/integration/v1/info")
  assert.equal(ConsoleAddress.parse("https://unifi.example:8443/integration/").url("/v1/sites", { offset: "0" }).href, "https://unifi.example:8443/integration/v1/sites?offset=0")
  assert.equal(ConsoleAddress.parse("[2001:db8::1]").origin, "https://[2001:db8::1]")
  assert.equal(ConsoleAddress.parse("192.0.2.1").serverName, undefined, "no SNI for an IP address")
  assert.equal(ConsoleAddress.parse("unifi.example").serverName, "unifi.example")
  assert.throws(() => ConsoleAddress.parse("http://192.0.2.1"), /https only/)
  assert.throws(() => ConsoleAddress.parse("https://user:key@192.0.2.1"), /own field/)
})

test("MAC addresses and fingerprints are compared in any common spelling", () => {
  assert.equal(MacAddress.normalize("02-00-00-AB-CD-EF"), "02:00:00:ab:cd:ef")
  assert.equal(MacAddress.normalize("020000abcdef"), "02:00:00:ab:cd:ef")
  assert.ok(MacAddress.equal("02:00:00:AB:CD:EF", "020000abcdef"))
  assert.ok(!MacAddress.equal(undefined, "02:00:00:ab:cd:ef"))
  const fingerprint = CertificateFingerprint.parse("ab cd ef 01 23 45 67 89 ab cd ef 01 23 45 67 89 ab cd ef 01 23 45 67 89 ab cd ef 01 23 45 67 89")
  assert.ok(fingerprint.matches("AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89"))
  assert.throws(() => CertificateFingerprint.parse("AB:CD"), /64 hex digits/)
})

test("voucher validity reads as people say it", () => {
  assert.equal(VoucherText.duration(45), "45 min")
  assert.equal(VoucherText.duration(1440), "1 day")
  assert.equal(VoucherText.duration(4440), "3 days 2 h")
  assert.equal(VoucherText.guests(undefined), "any number of guests")
  assert.equal(VoucherText.guests(1), "1 guest")
})
