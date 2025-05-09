
import { /* AppExc, Log, */ Operation } from '../src-fw/index'

import { SQLiteProvider, SQLiteConnector } from '../src-sl'
import { DbApp } from './appDbSt'

export class AppSQLiteConnector extends SQLiteConnector {
  constructor (code: string, dbpath: string, cryptIds: boolean, credentials: string) {
    super(code, dbpath, cryptIds, credentials)
    this.factory = AppSQLiteProvider.newProvider
  }
}

export class AppSQLiteProvider extends SQLiteProvider implements DbApp {
  public static newProvider (opts: AppSQLiteConnector, op: Operation, key: Buffer) {
    return new AppSQLiteProvider(opts, op, key)
  }
  constructor (opts: AppSQLiteConnector, op: Operation, key: Buffer) {
    super(opts, op, key)
  }

  /* Méthodes spécifiques de l'application */

}
