import { Database } from "./Database.ts"
import { MIGRATIONS } from "./migrations.ts"
import { Migrator } from "./Migrator.ts"
import { ForceRepository } from "./repositories/ForceRepository.ts"
import { LoadSampleRepository } from "./repositories/LoadSampleRepository.ts"
import { LoxoneSignalRepository } from "./repositories/LoxoneSignalRepository.ts"
import { MiniserverRepository } from "./repositories/MiniserverRepository.ts"
import { SessionRepository } from "./repositories/SessionRepository.ts"
import { SnapshotRepository } from "./repositories/SnapshotRepository.ts"
import { UserRepository } from "./repositories/UserRepository.ts"
import { WireRepository } from "./repositories/WireRepository.ts"

/** The migrated database and one repository per table group. */
export class Persistence {
  /** for code that needs transactions across repositories */
  readonly db: Database
  /** names of the migrations applied at construction, for the startup log */
  readonly applied: string[]
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly miniservers: MiniserverRepository
  readonly loxoneSignals: LoxoneSignalRepository
  readonly wires: WireRepository
  readonly forces: ForceRepository
  readonly snapshot: SnapshotRepository
  readonly loadSamples: LoadSampleRepository

  /**
   * Opens the file and migrates it before any repository exists.
   * @param file database path, or ":memory:" for tests
   * @param warn told about stored rows that can't be read back
   */
  constructor(file: string, warn: (message: string) => void) {
    this.db = new Database(file)
    this.applied = new Migrator(this.db, MIGRATIONS).migrate()
    this.users = new UserRepository(this.db)
    this.sessions = new SessionRepository(this.db)
    this.miniservers = new MiniserverRepository(this.db)
    this.loxoneSignals = new LoxoneSignalRepository(this.db)
    this.wires = new WireRepository(this.db)
    this.forces = new ForceRepository(this.db, warn)
    this.snapshot = new SnapshotRepository(this.db)
    this.loadSamples = new LoadSampleRepository(this.db, warn)
  }

  /** closes the database; repositories must not be used afterwards */
  close() {
    this.db.close()
  }
}
