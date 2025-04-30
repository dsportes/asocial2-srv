import Database from 'better-sqlite3'

import { DbProvider, Connexion } from '../src-fw/dbProvider'
import { Operation } from '../src-fw/operation'
import { AppExc } from '../src-fw/exception'
import { logDebug, logInfo, logError } from '../src-fw/log'
import { config } from '../src-app/app'

import path from 'path'
import { existsSync } from 'node:fs'

export async function connexion (provider: DbProvider, op: Operation, site?: string) {
  const cnx = new SQLiteConnexion(provider, op, site)
  await cnx.connect()
}

const pragma = 'journal_mode = WAL'

export class SQLiteProvider extends DbProvider {
  public path: string

  constructor (code: string, credKey: string) {
    super(code, credKey, connexion)
    this.path = path.resolve(this.credentials.path)
    if (!existsSync(this.path))
      throw new AppExc(null, 1020, 'SQLite b path not found', [this.path])
    logInfo('SQLite ' + this.code + ' path DB= [' + this.path + ']')
  }
}

class SQLiteConnexion extends Connexion {
  public path: string
  public lastSql: string[]
  public cachestmt: Object
  public sql: any
  
  constructor (provider: DbProvider, op: Operation, site?: string) {
    super(provider, op, site)
  }

  async connect () {
    this.lastSql = []
    this.cachestmt = { }
    const options = {
      verbose: (msg) => {
        if (config.debugLevel === 2) logDebug(msg)
        this.lastSql.unshift(msg)
        if (this.lastSql.length > 3) this.lastSql.length = 3
      } 
    }
    this.sql = new Database(this.path, options);
    this.sql.pragma(pragma)
    this.op.db = this
  }
} 
