import { Plugin, type WatchedValue } from "@lox-nexus/plugin-sdk"
import { JsonActuator } from "./actuators/JsonActuator.ts"
import { NumberActuator } from "./actuators/NumberActuator.ts"
import { SwitchActuator } from "./actuators/SwitchActuator.ts"
import { TextActuator } from "./actuators/TextActuator.ts"
import { BrokerConnection } from "./broker/BrokerConnection.ts"
import { BrokerTarget } from "./broker/BrokerTarget.ts"
import { ClientId } from "./broker/ClientId.ts"
import { ConnectionHealth } from "./broker/ConnectionHealth.ts"
import { CatalogTree } from "./catalog/CatalogTree.ts"
import { TopicBrowser } from "./catalog/TopicBrowser.ts"
import { ExportRegistry } from "./export/ExportRegistry.ts"
import { Exporter } from "./export/Exporter.ts"
import { HaDiscovery } from "./export/HaDiscovery.ts"
import { mqttConfigSchema, type MqttConfig } from "./MqttConfig.ts"
import { MqttPanel } from "./MqttPanel.ts"
import { NumberSensor } from "./sensors/NumberSensor.ts"
import { SwitchSensor } from "./sensors/SwitchSensor.ts"
import { TextSensor } from "./sensors/TextSensor.ts"
import { Subscriptions } from "./topics/Subscriptions.ts"
import { TopicRouter } from "./topics/TopicRouter.ts"

/**
 * One MQTT broker, both ways: sensors read topics, actuators publish to them, the catalog browses
 * what the broker has, and the signals chosen on the instance page are exported (retained, with
 * optional Home Assistant discovery).
 */
export class MqttPlugin extends Plugin<MqttConfig> {
  static readonly config = mqttConfigSchema
  static readonly sensors = [NumberSensor, SwitchSensor, TextSensor]
  static readonly actuators = [TextActuator, NumberActuator, SwitchActuator, JsonActuator]
  static readonly watches = { label: "Exported signals", description: "Values of these signals are published to the broker under the export base topic" }
  /** what a stop gives the offline status and the DISCONNECT */
  static readonly CLOSE_MS = 1500

  readonly target = BrokerTarget.describe(this.config.url)
  readonly clientId = ClientId.resolve(this.config.clientId, this.slug, this.store)
  private readonly statusTopic = this.config.onlineStatus ? `${this.config.baseTopic}/status` : undefined
  readonly connection = this.own(new BrokerConnection(
    { ...this.config, clientId: this.clientId, statusTopic: this.statusTopic },
    new ConnectionHealth(this.log, this.status, this.target)
  ))

  readonly subscriptions = this.own(new Subscriptions(this.connection, this.log))
  readonly router = this.own(new TopicRouter(this.connection, this.subscriptions))
  readonly browser = this.own(new TopicBrowser(this.connection, this.subscriptions, this.config.browseFilter, this.config.browseLimit))
  readonly exporter = this.own(new Exporter(
    this.connection,
    new ExportRegistry(this.store, this.log),
    this.config.discovery ? new HaDiscovery(this.config.discoveryPrefix, this.device(), this.statusTopic) : undefined,
    this.config.baseTopic,
    this.log
  ))

  override async start() {
    // registered after the children, so it runs before they are disposed
    this.onDispose(() => this.connection.close(MqttPlugin.CLOSE_MS))
    await this.connection.start()
  }

  override watchChanged() {
    this.exporter.watchChanged(this.watch.signals())
  }

  override watched(values: readonly WatchedValue[], dropped: number) {
    return this.exporter.watched(values, dropped)
  }

  override async catalog() {
    const tree = new CatalogTree()
    for (const topic of await this.browser.topics()) tree.add(topic)
    if (tree.truncated) this.log.info(`the catalog shows the first ${CatalogTree.MAX_ENTRIES} entries; narrow "Browse topics" to see the rest`)
    return tree.nodes()
  }

  override panel() {
    const { config, browser, exporter } = this
    return new MqttPanel(this.connection.stats, exporter.stats, {
      target: this.target,
      clientId: this.clientId,
      username: config.username,
      subscribedFilters: this.subscriptions.size,
      sensorTopics: this.router.topics,
      browsing: browser.active ? config.browseFilter : undefined,
      cached: browser.cache.size,
      cacheLimit: browser.cache.limit,
      evicted: browser.cache.evicted,
      watchedSignals: this.watch.signals().length,
      baseTopic: config.baseTopic,
      discovery: config.discovery ? `on: ${exporter.discoveryConfigs} configs under ${config.discoveryPrefix}/` : "off",
      pendingClears: exporter.pendingClears
    }).build()
  }

  private device() {
    return { instanceId: this.context.instanceId, name: this.slug ? `Lox Nexus ${this.slug}` : "Lox Nexus" }
  }
}
