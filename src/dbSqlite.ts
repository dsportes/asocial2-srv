
import { /* AppExc, Log, */ Operation } from '../src-fw/index'

import { getOptions, SQLiteConnexion, SQLiteOptions } from '../src-sl'
import { DbApp } from './appDbSt'

export async function appSQLiteConnexion (code: string, site: string, op: Operation) {
  const cnx = new AppSQLiteConnexion(getOptions(code, site), op)
  await cnx.connect()
}

class AppSQLiteConnexion extends SQLiteConnexion implements DbApp{
  constructor (opts: SQLiteOptions, op: Operation) { super(opts, op) }

  /* Méthodes spécifiques de l'application */

}
