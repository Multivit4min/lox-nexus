import type { AdoptPacket, LoxoneSignalDto, LoxoneSignalInput } from "@lox-nexus/api"

/** what the changing Loxone tools call: LoxoneSignalService, as the REST controller does */
export interface LoxoneSignalWrites {
  list(miniserverId: string): LoxoneSignalDto[]
  add(miniserverId: string, input: LoxoneSignalInput): LoxoneSignalDto
  update(miniserverId: string, signalId: string, input: LoxoneSignalInput, by: string): LoxoneSignalDto
  remove(miniserverId: string, signalId: string, by: string): void
  adopt(miniserverId: string, input: AdoptPacket, by: string): LoxoneSignalDto
}
