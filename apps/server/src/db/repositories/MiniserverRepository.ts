import type { MiniserverConfig } from "@lox-nexus/loxone"
import type { Database } from "../Database.ts"

/** A row of `miniservers`: booleans are 0/1 integers, optional fields are NULL; resend_interval is ms. */
interface MiniserverRow {
  id: string
  slug: string
  label: string
  host: string
  port: number
  listen_port: number
  listen_address: string | null
  own_id: string
  remote_id: string
  password: string | null
  enabled: number
  resend_interval: number
}

/**
 * Miniserver configs. Rows are returned as unvalidated input: MiniserverManager parses them, so a
 * row a newer version wrote can't slip past the schema.
 */
export class MiniserverRepository {
  constructor(private readonly db: Database) {}

  /** ordered by label for a stable UI; includes the plain-text password, so never pass these to a DTO unfiltered */
  list(): MiniserverConfig[] {
    return this.db.all<MiniserverRow>("SELECT * FROM miniservers ORDER BY label, id").map(MiniserverRepository.toConfig)
  }

  /** undefined when unknown */
  get(id: string): MiniserverConfig | undefined {
    const row = this.db.get<MiniserverRow>("SELECT * FROM miniservers WHERE id = :id", { id })
    return row && MiniserverRepository.toConfig(row)
  }

  /** inserts or replaces by id */
  save(config: MiniserverConfig) {
    this.db.run(
      `INSERT INTO miniservers (id, slug, label, host, port, listen_port, listen_address, own_id, remote_id, password, enabled, resend_interval)
       VALUES (:id, :slug, :label, :host, :port, :listenPort, :listenAddress, :ownId, :remoteId, :password, :enabled, :resendInterval)
       ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, label = excluded.label, host = excluded.host, port = excluded.port,
         listen_port = excluded.listen_port, listen_address = excluded.listen_address, own_id = excluded.own_id,
         remote_id = excluded.remote_id, password = excluded.password, enabled = excluded.enabled, resend_interval = excluded.resend_interval`,
      {
        id: config.id, slug: config.slug, label: config.label, host: config.host, port: config.port,
        listenPort: config.listenPort, listenAddress: config.listenAddress ?? null, ownId: config.ownId,
        remoteId: config.remoteId, password: config.password ?? null, enabled: config.enabled ? 1 : 0,
        resendInterval: config.resendInterval
      }
    )
  }

  /** deletes the Miniserver with its signals; their wires go with them through the foreign keys */
  delete(id: string) {
    this.db.transaction(() => {
      this.db.run("DELETE FROM signals WHERE id IN (SELECT id FROM loxone_signals WHERE miniserver_id = :id)", { id })
      this.db.run("DELETE FROM miniservers WHERE id = :id", { id })
    })
  }

  // NULL columns become absent fields, because the config schema distinguishes absent from undefined-by-default
  private static toConfig(row: MiniserverRow): MiniserverConfig {
    return {
      id: row.id, slug: row.slug, label: row.label, host: row.host, port: row.port, listenPort: row.listen_port,
      ownId: row.own_id, remoteId: row.remote_id, enabled: row.enabled === 1, resendInterval: row.resend_interval,
      ...(row.listen_address === null ? {} : { listenAddress: row.listen_address }),
      ...(row.password === null ? {} : { password: row.password })
    }
  }
}
