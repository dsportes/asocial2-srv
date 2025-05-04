// import { Database } from './loadreq.js'
import Database from 'better-sqlite3'

import { DbOptions, DbConnexion } from '../src-fw/dbProvider'
import { Operation } from '../src-fw/operation'
import { AppExc } from '../src-fw/exception'
import { logDebug, logInfo, logError } from '../src-fw/log'
import { config } from '../src-app/app'

import path from 'path'
import { existsSync } from 'node:fs'

const pragma = 'journal_mode = WAL'

export class SQLiteOptions extends DbOptions{
  public path: string
  constructor (code: string, site: string) {
    super(code, site)
    const p = this.cfg.path
    if (!p)
      throw new AppExc(1030, 'SQLite path absent', null, [code])
    this.path = path.resolve(p)
    if (!existsSync(this.path))
      throw new AppExc(1020, 'SQLite path not found', null, [code, p])
    logInfo('SQLite ' + code + '/' + site + ' DB path= [' + p + ']')

  }
}

const optionsCache = new Map<string, SQLiteOptions>()

export function getOptions (code: string, site: string) : SQLiteOptions{
  let opts = optionsCache.get(code + '/' + site)
  if (!opts) {
    opts = new SQLiteOptions(code, site)
    optionsCache.set(code + '/' + site, opts)
  }
  return opts
}

export async function fwSqlConnexion (code: string, site: string, op: Operation) {
  const cnx = new SQLiteConnexion(getOptions(code, site), op)
  await cnx.connect()
}

export class SQLiteConnexion extends DbConnexion {
  public path: string
  public lastSql: string[]
  public cachestmt: Object
  public sql: any
  
  constructor (opts: SQLiteOptions, op: Operation) {
    super(opts, op)
    this.path = opts.path
    this.lastSql = []
    this.cachestmt = { }
  }

  async connect () {
    const options = {
      // nativeBinding: require('better-sqlite3/build/Release/better_sqlite3.node'),
      verbose: (msg: string) => {
        if (config.debugLevel === 2) logDebug(msg)
        this.lastSql.unshift(msg)
        if (this.lastSql.length > 3) this.lastSql.length = 3
      } 
    }

    try {
      this.sql = new Database(this.path, options), 
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
