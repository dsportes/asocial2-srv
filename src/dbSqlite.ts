
import { Operation } from '../src-fw/operation'
import { AppExc } from '../src-fw/exception'
import { logDebug, logInfo, logError } from '../src-fw/log'

import { getOptions, SQLiteConnexion, SQLiteOptions } from '../src-fw/dbSqlite'
import { DbGeneric } from './appDbSt'

export async function appSqlConnexion (code: string, site: string, op: Operation) {
  const cnx = new AppSQLiteConnexion(getOptions(code, site), op)
  await cnx.connect()
}

class AppSQLiteConnexion extends SQLiteConnexion implements DbGeneric{
  constructor (opts: SQLiteOptions, op: Operation) { super(opts, op) }

  /* Méthodes spécifiques de l'application */

}
