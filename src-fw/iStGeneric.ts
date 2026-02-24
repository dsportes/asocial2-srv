/* Interface d'accès générique au Storage */
import { Operation } from './operation'

export interface IStGeneric {
  decode3 (b64: string) : any

  ping (op: Operation) : Promise<[number, string]> 
  getUrl (op: Operation, id1: string, id2: string, id3: string): string
  putUrl (op: Operation, id1: string, id2: string, id3: string): string
  getFile (op: Operation, id1: string, id2: string, id3:string) : Promise<Buffer>
  putFile (op: Operation, id1: string, id2: string, id3:string, data: Buffer) : Promise<void>
  delFiles (op: Operation, id1: string, id2: string, lidf: string[]) : Promise<void>
  delId (op: Operation, id1: string, id2: string) : Promise<void>
  delOrg (op: Operation, id1: string) : Promise<void>
  listFiles (op: Operation, id1: string, id2: string) : Promise<string[]>
  listIds (op: Operation, id1: string) : Promise<string[]>
}
