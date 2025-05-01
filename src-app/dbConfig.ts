import { Operation } from '../src-fw/operation'
import { AppExc } from '../src-fw/exception'
import { appSqlConnexion } from '../src-app/dbSqlite'

export async function dbConnexion (code: string, site: string, op: Operation) {
  if (code.startsWith('sql'))
    return await appSqlConnexion(code, site, op)
  throw new AppExc(8002, 'dbCode not implemented', op, [code])
}

export interface DbGeneric {
  ping () : Promise<[number, string]> 
}
