import type { MqttConfig } from "../MqttConfig.ts"
import { BrokerConnection } from "./BrokerConnection.ts"
import { BrokerTarget } from "./BrokerTarget.ts"
import { ConnectionHealth } from "./ConnectionHealth.ts"

/**
 * Test connection: one connect with the instance's broker settings and a client id of its own (so
 * a running instance isn't kicked off), then a clean disconnect. Publishes and subscribes nothing.
 */
export class ConnectionTest {
  static async run(config: MqttConfig): Promise<string> {
    const target = BrokerTarget.describe(config.url)
    const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    const clientId = `lox-nexus-test-${Math.random().toString(16).slice(2, 10)}`
    const connection = new BrokerConnection({ ...config, clientId, statusTopic: undefined }, new ConnectionHealth(quiet, { set: () => {} }, target))
    try {
      await connection.start()
      if (!connection.connected) throw new Error(connection.stats.lastError?.message ?? `${target} didn't answer within ${BrokerConnection.START_WAIT_MS / 1000} s`)
      return `Connected to ${target}`
    } finally {
      await connection.close(500)
      await connection.dispose()
    }
  }
}
