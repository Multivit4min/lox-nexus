/** Size limits imposed by UDP over IPv4, which are stricter than the 16-bit length field. */
export class UdpLimits {
  /** 65535 minus the 8 byte UDP header and the 20 byte IPv4 header */
  static readonly MAX_DATAGRAM = 65507
  /** largest payload that still fits a 0x9E data packet into one datagram */
  static readonly MAX_DATA_PAYLOAD = UdpLimits.MAX_DATAGRAM - 38
}
