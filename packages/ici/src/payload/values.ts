import { DataType } from "../DataType.ts"

/**
 * @experimental Believed to be a Float64 bitmask of the five buttons, see PROTOCOL.md and T5Buttons.
 */
export interface T5Value {
  buttons: number
}

export interface RgbwValue {
  /** 0–100 */
  red: number
  green: number
  blue: number
  white: number
  /** seconds, 0.1 s resolution */
  fadeTime: number
  /** @experimental bytes 6–7; 0x4000 is set on lighting sequence steps */
  flags: number
}

export interface SingleChannelValue {
  /** 0–100 */
  channel: number
  /** seconds, 0.1 s resolution */
  fadeTime: number
}

/** @experimental fade unit unconfirmed, see PROTOCOL.md */
export interface TunableWhiteValue {
  /** Kelvin */
  temperature: number
  /** 0–100 */
  brightness: number
  /** seconds, 0.1 s resolution */
  fadeTime: number
}

/** Maps every data type to the JavaScript value it carries. */
export interface ValueMap {
  [DataType.Digital]: boolean
  [DataType.Analog]: number
  [DataType.Text]: string
  [DataType.T5]: T5Value
  [DataType.SmartRgbw]: RgbwValue
  [DataType.SmartSingleChannel]: SingleChannelValue
  [DataType.SmartTunableWhite]: TunableWhiteValue
}
