/* Implémentation SQLite d'accès à l'application */

import { /* AppExc, Log, */ Operation } from '../src-fw/index'

import { FirestoreConnexion, FirestoreConnector } from '../src-firestore'
import { IDbApp } from './iDbapp'

export class AppFirestoreConnector extends FirestoreConnector {
  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.factory = AppFirestoreConnexion.newConnexion
  }
}

export class AppFirestoreConnexion extends FirestoreConnexion implements IDbApp {
  public static newConnexion (connector: AppFirestoreConnector, op: Operation, cryptKey?: string) {
    return new AppFirestoreConnexion(connector, op, cryptKey)
  }
  constructor (connector: AppFirestoreConnector, op: Operation, cryptKey?: string) {
    super(connector, op, cryptKey)
  }

  /* Méthodes spécifiques de l'application */

  fakeForTest () : Promise<[number, string]> {
    return null
  }
}
