import { Plugin } from "@lox-nexus/plugin-sdk"
import { NumberActuator } from "./actuators/NumberActuator.ts"
import { SwitchActuator } from "./actuators/SwitchActuator.ts"
import { TextActuator } from "./actuators/TextActuator.ts"
import { NexusApi } from "./nexus/NexusApi.ts"
import { ScriptStore } from "./nexus/ScriptStore.ts"
import type { ScriptRealm } from "./run/ScriptRealm.ts"
import { ScriptLog } from "./run/ScriptLog.ts"
import { ScriptRunner } from "./run/ScriptRunner.ts"
import { ScriptState } from "./run/ScriptState.ts"
import { ScriptCatalog } from "./ScriptCatalog.ts"
import { scriptConfigSchema, type ScriptConfig } from "./ScriptConfig.ts"
import { ScriptPanel } from "./ScriptPanel.ts"
import { NumberSensor } from "./sensors/NumberSensor.ts"
import { SwitchSensor } from "./sensors/SwitchSensor.ts"
import { TextSensor } from "./sensors/TextSensor.ts"
import { Inbox } from "./variables/Inbox.ts"
import { Outbox } from "./variables/Outbox.ts"
import { VariableTable } from "./variables/VariableTable.ts"

/**
 * Runs the admin's JavaScript, which exchanges values with the rest of Nexus through this
 * instance's own variables: `nexus.set` feeds the sensors of a name, actuators feed `nexus.on` and
 * `nexus.get`. Wires connect those signals to anything else; the script has no access to the bus.
 *
 * The script is part of the config, so saving the instance restarts it with the new code.
 */
export class ScriptPlugin extends Plugin<ScriptConfig> {
  static readonly config = scriptConfigSchema
  static readonly sensors = [NumberSensor, TextSensor, SwitchSensor]
  static readonly actuators = [NumberActuator, TextActuator, SwitchActuator]

  readonly variables = new VariableTable((limit, direction) => this.log.warn(direction === "set"
    ? `the script used more than ${limit} names with nexus.set; further new names are not remembered for the catalog, the panel or later sensors`
    : `the script used more than ${limit} names with nexus.on and nexus.get; further new names are refused`))
  readonly state = new ScriptState()
  readonly outbox = this.own(new Outbox(this.variables))
  // registered after the outbox, so stopping ends the script before its throttle
  private readonly runner: ScriptRunner = this.own(new ScriptRunner({
    log: new ScriptLog(this.log),
    status: this.status,
    state: this.state,
    nexus: realm => this.nexus(realm)
  }))
  readonly inbox: Inbox = this.own(new Inbox(this.variables, (origin, error) => this.runner.guard.report(origin, error), value => this.runner.adopt(value)))

  override start() {
    this.runner.start(this.config.script)
  }

  override catalog() {
    return new ScriptCatalog(this.variables).build()
  }

  /** every rejection in this worker is the script's: the plugin's own code handles its promises */
  override unhandledRejection(reason: unknown) {
    this.runner.rejected(reason)
  }

  override panel() {
    return new ScriptPanel(this.state, this.variables, () => this.runner.activeTimers).build()
  }

  private nexus(realm: ScriptRealm): unknown {
    return new NexusApi(this.outbox, this.inbox, new ScriptStore(this.store, realm), realm).build()
  }
}
