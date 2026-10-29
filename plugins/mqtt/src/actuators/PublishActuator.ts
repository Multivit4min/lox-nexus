import { Actuator } from "@lox-nexus/plugin-sdk"
import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { MqttPlugin } from "../MqttPlugin.ts"
import type { PublishParams } from "./PublishParams.ts"

/**
 * Publishes each command to one topic. Only while connected: a command for an offline broker
 * fails at once with the reason, instead of being queued and sent minutes later. With QoS 1 or 2
 * the command succeeds once the broker confirmed it (10 s at most). "latest": while one message is
 * waiting for its confirmation, only the newest command waits behind it.
 */
export abstract class PublishActuator<Params extends PublishParams = PublishParams, V extends Value = Value> extends Actuator<MqttPlugin, Params, V> {
  static readonly concurrency = "latest"

  async run(value: V) {
    const { topic, retain, qos } = this.params
    await this.plugin.connection.publish(topic, this.payload(value), { retain, qos: Number(qos) as 0 | 1 | 2 })
  }

  protected abstract payload(value: V): string
}
