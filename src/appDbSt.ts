import { Operation, AppExc } from '../src-fw/index'
import { getOptions, DbGeneric, StGeneric } from '../src-dbst/index'


// Choix de l'application
import { FsStorage } from '../src-fs'
import { appSQLiteConnexion } from './dbSqlite'

export async function dbConnexion (code: string, site: string, op: Operation) {
  if (code.startsWith('sql'))
    return await appSQLiteConnexion(code, site, op)
  throw new AppExc(8002, 'dbCode not implemented', op, [code])
}

export function storageFactory (code: string, site: string): StGeneric {
  const options = getOptions(code, site)
  if (code.startsWith('fs'))
    return new FsStorage(options)
  throw new AppExc(8003, 'storage code not implemented', null, [code])
}

export interface DbApp extends DbGeneric {
  ping () : Promise<[number, string]> 
}

export interface StApp extends StGeneric {
  ping () : Promise<[number, string]> 
}
