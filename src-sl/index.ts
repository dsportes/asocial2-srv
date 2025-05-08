// import { Database } from './loadreq.js'
import Database from 'better-sqlite3'

import { DbConnector, DbProvider, DbGeneric } from '../src-dbst/index'
import { Operation, AppExc, Log } from '../src-fw/index'

import path from 'path'
import { existsSync } from 'node:fs'

export class SQLiteConnector extends DbConnector {
  public path: string

  constructor (code: string, dbpath: string, cryptIds: boolean, credentials: string) {
    super(code, cryptIds, credentials)
    if (!dbpath)
      throw new AppExc(1030, 'SQLite path absent', null, [code])
    this.path = path.resolve(dbpath)
    if (!existsSync(this.path))
      throw new AppExc(1020, 'SQLite path not found', null, [code, this.path])
    Log.info('SQLite ' + code + ' DB path= [' + this.path + ']')
    this.cnxClass = SQLiteProvider
  }
}

export class SQLiteProvider extends DbProvider implements DbGeneric {
  public path: string
  public lastSql: string[]
  public cachestmt: Object
  public sql: any
  
  constructor (opts: SQLiteConnector, op: Operation, key: Buffer) {
    super(opts, op, key)
    this.path = opts.path
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
    this.op.db = this
    return this
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
