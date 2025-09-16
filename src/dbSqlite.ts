/* Implémentation SQLite d'accès à l'application */

import { AppExc } from '../src-fw/index'
import { Log } from '../src-fw/log'
import { Operation } from '../src-fw/operation'
import { SQLiteConnexion, SQLiteConnector } from '../src-sqlite'
import { IDbApp } from './iDbapp'

export class AppSQLiteConnector extends SQLiteConnector {
  static async genSchema () { await SQLiteConnector.genSchema() }

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.factory = AppSQLiteConnexion.newConnexion
  }
}

export class AppSQLiteConnexion extends SQLiteConnexion implements IDbApp {
  public static newConnexion (connector: AppSQLiteConnector, op: Operation) {
    return new AppSQLiteConnexion(connector, op)
  }
  constructor (connector: AppSQLiteConnector, op: Operation) {
    super(connector, op)
  }

  /* Méthodes spécifiques de l'application */

  fakeForTest () : Promise<[number, string]> {
    return null
  }
  
}
