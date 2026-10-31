import { X509Certificate, generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { Der } from "./Der.ts"

// ecdsa-with-SHA256 and commonName
const ECDSA_SHA256 = "1.2.840.10045.4.3.2"
const COMMON_NAME = "2.5.4.3"

/**
 * A fresh self-signed certificate (EC P-256), made in the test process, like the one a UniFi
 * console ships with. No key is stored in the repository.
 */
export class SelfSignedCertificate {
  private constructor(readonly cert: string, readonly key: string, readonly fingerprint: string) {}

  static generate(commonName = "unifi.test") {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    const algorithm = Der.sequence(Der.oid(ECDSA_SHA256))
    const name = Der.sequence(Der.set(Der.sequence(Der.oid(COMMON_NAME), Der.utf8(commonName))))
    const serial = randomBytes(8)
    serial[0] = serial[0]! & 0x7f | 0x01
    const tbs = Der.sequence(
      Der.explicit(0, Der.integer(Buffer.from([2]))),
      Der.integer(serial),
      algorithm,
      name,
      Der.sequence(Der.utcTime(new Date("2020-01-01T00:00:00Z")), Der.utcTime(new Date("2049-12-31T00:00:00Z"))),
      name,
      publicKey.export({ type: "spki", format: "der" })
    )
    const der = Der.sequence(tbs, algorithm, Der.bitString(sign("sha256", tbs, privateKey)))
    const pem = `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`
    const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    return new SelfSignedCertificate(pem, key, new X509Certificate(der).fingerprint256)
  }
}
