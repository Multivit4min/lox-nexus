import { DeviceRestartActuator } from "./actuators/DeviceRestartActuator.ts"
import { GuestAccessActuator } from "./actuators/GuestAccessActuator.ts"
import { PortPowerCycleActuator } from "./actuators/PortPowerCycleActuator.ts"
import { VoucherActuator } from "./actuators/VoucherActuator.ts"
import { WifiEnabledActuator } from "./actuators/WifiEnabledActuator.ts"
import { ClientConnectedSensor } from "./sensors/ClientConnectedSensor.ts"
import { ClientIpSensor } from "./sensors/ClientIpSensor.ts"
import { ClientUplinkSensor } from "./sensors/ClientUplinkSensor.ts"
import { DeviceCpuSensor } from "./sensors/DeviceCpuSensor.ts"
import { DeviceMemorySensor } from "./sensors/DeviceMemorySensor.ts"
import { DeviceOnlineSensor } from "./sensors/DeviceOnlineSensor.ts"
import { DeviceStateSensor } from "./sensors/DeviceStateSensor.ts"
import { DeviceUpdateSensor } from "./sensors/DeviceUpdateSensor.ts"
import { DeviceUplinkRxSensor } from "./sensors/DeviceUplinkRxSensor.ts"
import { DeviceUplinkTxSensor } from "./sensors/DeviceUplinkTxSensor.ts"
import { DeviceUptimeSensor } from "./sensors/DeviceUptimeSensor.ts"
import { PortLinkSensor } from "./sensors/PortLinkSensor.ts"
import { PortPoeSensor } from "./sensors/PortPoeSensor.ts"
import { PortSpeedSensor } from "./sensors/PortSpeedSensor.ts"
import { VoucherCodeSensor } from "./sensors/VoucherCodeSensor.ts"
import { WifiEnabledSensor } from "./sensors/WifiEnabledSensor.ts"

// the plugin's capabilities in one list each, in the order the UI offers them; ids are stored with signals, never rename them

export const SENSORS = [
  ClientConnectedSensor, ClientUplinkSensor, ClientIpSensor,
  DeviceOnlineSensor, DeviceStateSensor, DeviceUpdateSensor,
  DeviceCpuSensor, DeviceMemorySensor, DeviceUptimeSensor, DeviceUplinkRxSensor, DeviceUplinkTxSensor,
  PortLinkSensor, PortSpeedSensor, PortPoeSensor,
  WifiEnabledSensor, VoucherCodeSensor
]

export const ACTUATORS = [DeviceRestartActuator, PortPowerCycleActuator, GuestAccessActuator, WifiEnabledActuator, VoucherActuator]
