
import { /* AppExc, Log, */ Operation } from '../src-fw/index'

import { SQLiteProvider, SQLiteOptions } from '../src-sl'
import { DbApp } from './appDbSt'



export class AppSQLiteProvider extends SQLiteProvider implements DbApp {
  constructor (opts: SQLiteOptions, op: Operation) { super(opts, op) }

  /* Méthodes spécifiques de l'application */

}
