import { ThermostatServer } from "@matter/main/behaviors/thermostat"

/** a thermostat that heats and cools, and switches between them on its own in auto mode */
export const HeatCoolServer = ThermostatServer.with("Heating", "Cooling", "AutoMode")
