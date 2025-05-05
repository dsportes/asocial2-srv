import { Operation } from '../src-fw/operation'
import { AppExc } from '../src-fw/exception'
import { getOptions } from '../src-fw/stProvider'

import { fsConnexion } from '../src-fw/storageFS'

import { appSqlConnexion } from './dbSqlite'

export async function dbConnexion (code: string, site: string, op: Operation) {
  if (code.startsWith('sql'))
    return await appSqlConnexion(code, site, op)
  throw new AppExc(8002, 'dbCode not implemented', op, [code])
}

export async function stConnexion (code: string, site: string) {
  const options = getOptions(code, site)
  if (code.startsWith('fs'))
    return new fsConnexion(options)
  throw new AppExc(8003, 'storage code not implemented', null, [code])
}

export interface StGeneric {
  ping () : Promise<[number, string]> 
  getUrl (id1: string, id2: string, id3: string): string
  putUrl (id1: string, id2: string, id3: string): string
  getFile (id1: string, id2: string, id3:string) : Promise<Buffer>
  putFile (id1: string, id2: string, id3:string, data: Buffer) : Promise<void>
  delFiles (id1: string, id2: string, lidf: string[]) : Promise<void>
  delId (id1: string, id2: string) : Promise<void>
  delOrg (id1: string) : Promise<void>
  listFiles (id1: string, id2: string) : Promise<string[]>
  listIds (id1: string) : Promise<string[]>
}

export interface DbGeneric {
  ping () : Promise<[number, string]> 
}
