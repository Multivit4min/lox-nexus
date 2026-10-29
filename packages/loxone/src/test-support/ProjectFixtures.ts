import { zipSync } from "fflate"

/**
 * Builds project files for tests: a synthetic Loxone Config XML shaped like a real one (real
 * projects carry the owner's address and contacts, so none is checked in) and its `.LoxCC` and zip
 * wrappings.
 */
export class ProjectFixtures {
  static readonly XML = `\uFEFF<?xml version="1.0" encoding="utf-8"?>
<ControlList Version="274">
  <C Type="Document" Title="Test house" Date="2026-10-24 14:27:35" Timezone="Europe/Vienna">
    <C Type="LanInt" Title="Network Intercommunication" Pt="61263" MId="server">
      <C Type="HItcDev" Title="nexus-dev" sid="nexus" enc="false" dP="61264" dAd="10.0.0.5" At="900">
        <C Type="Online" IName="S0" Title="Online Status nexus-dev"/>
        <C Type="HItcIn" Title="PV power" Desc="from the inverter" tp="1" pid="pvpower" Signed="true"/>
        <C Type="HItcIn" Title="Door" pid="door"/>
        <C Type="HItcOut" IName="Q1" Title="Kitchen light" tp="4" pid="lkitchen" RptR="10">
          <Co K="I" Nc="1"><In Input="x"/></Co>
        </C>
        <C Type="HItcOut" IName="Q2" Title="Trash day" tp="2" pid="trash"/>
        <C Type="HItcOut" IName="Q3" Title="No packet id"/>
      </C>
      <C Type="HItcDev" Title="secure-dev" sid="secure" enc="true" dP="61263" dAd="10.0.0.6">
        <C Type="HItcOut" Title="Temperature &amp; humidity" tp="1" pid="temp"/>
      </C>
    </C>
    <C Type="HItcIn" Title="Outside any peer" tp="1" pid="stray"/>
  </C>
</ControlList>
`

  /** a `.LoxCC` file whose LZ4 block holds `data` as one run of literals */
  static loxcc(data: Uint8Array): Buffer {
    const block = Buffer.concat([ProjectFixtures.literalToken(data.length), data])
    const header = Buffer.alloc(16)
    header.writeUInt32LE(0xaabbccee, 0)
    header.writeUInt32LE(block.length, 4)
    header.writeUInt32LE(data.length, 8)
    return Buffer.concat([header, block])
  }

  /** the archive a Miniserver stores: the project as `sps0.LoxCC` next to other files */
  static zip(xml = ProjectFixtures.XML): Uint8Array {
    return zipSync({
      "sps0.LoxCC": ProjectFixtures.loxcc(Buffer.from(xml)),
      "Emergency.LoxCC": ProjectFixtures.loxcc(Buffer.from("<other/>")),
      "LoxAPP3.json": Buffer.from("{}")
    })
  }

  // a literal length over 14 continues in extra bytes of up to 255 each
  private static literalToken(length: number): Buffer {
    if (length < 15) return Buffer.from([length << 4])
    const extra: number[] = []
    let rest = length - 15
    for (; rest >= 255; rest -= 255) extra.push(255)
    return Buffer.from([0xf0, ...extra, rest])
  }
}
