/* Implémentation SQLite d'accès à l'application */

import { /* AppExc, Log, */ Operation } from '../src-fw/index'

import { SQLiteProvider, SQLiteConnector } from '../src-sqlite'
import { IDbApp } from './iDbapp'

export class AppSQLiteConnector extends SQLiteConnector {
  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.factory = AppSQLiteProvider.newProvider
  }
}

export class AppSQLiteProvider extends SQLiteProvider implements IDbApp {
  public static newProvider (connector: AppSQLiteConnector, op: Operation) {
    return new AppSQLiteProvider(connector, op)
  }
  constructor (connector: AppSQLiteConnector, op: Operation) {
    super(connector, op)
  }

  /* Méthodes spécifiques de l'application */

  fakeForTest () : Promise<[number, string]> {
    return null
  }
}
