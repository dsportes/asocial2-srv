import path from 'path'
import { existsSync } from 'node:fs'
// import { Database } from './loadreq.js'
import Database from 'better-sqlite3'

import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric } from '../src-fw/iDbGeneric'
import { Operation, AppExc, Log } from '../src-fw/index'

export class SQLiteConnector extends DbConnector {
  public path: string

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    const path = credentials['path']
    if (!path)
      throw new AppExc(1030, 'SQLite path absent', null)
    this.path = path.resolve(path)
    if (!existsSync(this.path))
      throw new AppExc(1020, 'SQLite path not found', null, [this.path])
    Log.info('SQLite ' + ' DB path= [' + this.path + ']')
    this.factory = SQLiteProvider.newProvider
  }
}

export class SQLiteProvider extends DbConnexion implements IDbGeneric {
  public static newProvider (connector: SQLiteConnector, op: Operation) {
    return new SQLiteProvider(connector, op)
  }

  public path: string
  public lastSql: string[]
  public cachestmt: Object
  public sql: any
  
  constructor (connector: SQLiteConnector, op: Operation) {
    super(connector, op)
    this.path = connector.path
    this.lastSql = []
    this.cachestmt = { }
  }

  async connect () {
    const sqloptions = {
      // nativeBinding: require('better-sqlite3/build/Release/better_sqlite3.node'),
      verbose: (msg: string) => {
        if (Operation.config.debugLevel === 2) Log.debug(msg)
        this.lastSql.unshift(msg)
        if (this.lastSql.length > 3) this.lastSql.length = 3
      } 
    }

    try {
      this.sql = new Database(this.path, sqloptions), 
      this.sql.pragma('journal_mode = WAL')
    } catch (e) {
      throw new AppExc(1024, 'SQLite connexion failed', this.op, [e.message])
    }
  }

  // Méthode PUBLIQUE de déconnexion, impérative et sans exception
  async disconnect () {
    try { this.sql.close() } catch (e2) { /* */ }
  }

  private trap (e: any) : [number, string] { // 1: busy, 2: autre
    if (e.constructor.name !== 'SqliteError') throw e
    const s = (e.code || '???') + '\n' + (e.message || '') + '\n' + 
      (e.stack ? e.stack + '\n' : '') + this.lastSql.join('\n')
    if (e.code && e.code.startsWith('SQLITE_BUSY')) return [1, s]
    return [2, s]
  }

  // Méthode PUBLIQUE de test: retour comme doTransaction [0 / 1 / 2, detail]
  async ping () : Promise<[number, string]> {
    try {
      const stmt = this.sql.prepare('SELECT _data_ FROM singletons WHERE id = \'1\'')
      const t = stmt.get()
      const d = new Date()
      const v = d.getTime()
      const _data_ = d.toISOString()
      if (t) {
        const stu = this.sql.prepare('UPDATE singletons SET _data_ = @_data_, v = @v  WHERE id = \'1\'')
        stu.run({ v, _data_ })
      } else {
        const sti = this.sql.prepare('INSERT INTO singletons (id, v, _data_) VALUES (\'1\', @v, @_data_)')
        sti.run({ v, _data_ })
      }
      const m = 'Sqlite ping OK: ' + (t && t._data_ ? t._data_ : '?') + ' <=> ' + _data_
      return [0, m]
    } catch (e) {
      return this.trap(e)
    }
  }
  
}
