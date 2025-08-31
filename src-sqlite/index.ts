import Database from 'better-sqlite3'
// import { Database } from './loadreq.js'

import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric, comparator } from '../src-fw/iDbGeneric'
import { DocPattern } from '../src-fw/document'
import { AppExc } from '../src-fw/index'
import { Log } from '../src-fw/log'
import { Operation } from '../src-fw/operation'

import path from 'path'
import { existsSync } from 'node:fs'

export class SQLiteConnector extends DbConnector {
  public path: string

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    const p = credentials['path']
    if (!p)
      throw new AppExc(1030, 'SQLite path absent', null)
    this.path = path.resolve(p)
    if (!existsSync(this.path))
      throw new AppExc(1020, 'SQLite path not found', null, [this.path])
    Log.info('SQLite ' + ' DB path= [' + this.path + ']')
    this.factory = SQLiteConnexion.newConnexion
  }
}

export class SQLiteConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: SQLiteConnector, op: Operation, cryptKey?: string) {
    return new SQLiteConnexion(connector, op, cryptKey)
  }

  public path: string
  public lastSql: string[]
  public cachestmt: Object
  public sql: any
  
  constructor (connector: SQLiteConnector, op: Operation, cryptKey?: string) {
    super(connector, op, cryptKey)
    this.path = connector.path
    this.lastSql = []
    this.cachestmt = { }
    this.transaction = null
  }

  /* 27 méthodes publiques */

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

  async ping () : Promise<[number, string]> {
    try {
      const stmt = this.sql.prepare('SELECT data FROM Hdr WHERE id = \'ping\'')
      const t = stmt.get()
      const d = new Date()
      const v = d.getTime()
      const data = d.toISOString()
      if (t) {
        const stu = this.sql.prepare('UPDATE Hdr SET data = @_data_, v = @v  WHERE id = \'ping\'')
        stu.run({ v, data })
      } else {
        const sti = this.sql.prepare('INSERT INTO Hdr (id, v, data) VALUES (\'ping\', @v, @data)')
        sti.run({ v, data })
      }
      const m = 'Sqlite ping OK: ' + (t && t.data ? t.data : '?') + ' <=> ' + data
      return [0, m]
    } catch (e) {
      return this.trap(e)
    }
  }
  
  async doTransaction () : Promise<[number, string]> {
    try {
      this.transaction = true
      this.sql.prepare('BEGIN').run()
      await this.op.transac()
      this.sql.prepare('COMMIT').run()
      this.transaction = false
      return [0, '']
    } catch (e) {
      try { this.sql.prepare('ROLLBACK').run() } catch (e2) { /* */ }
      this.transaction = false
      return this.trap(e)
    }
  }

  _stmt (code: string, sql: string) {
    let s = this.cachestmt[code]
    if (!s) {
      if (!sql) return null
      s = this.sql.prepare(sql)
      this.cachestmt[code] = s
    }
    return s
  }

  async getDoc (pattern: DocPattern, v?: number) : Promise<Uint8Array> { return null }
  async insertDoc (row: Object) {}
  async updateDoc (row: Object) {}
  async deleteDoc (pattern: DocPattern) {}
  async listDocs (pattern: DocPattern, v?: number, fn? : Function) { return [] }
  async listDocsSk (pattern: DocPattern, ik: number, v?: number, fn? : Function) { return [] }
  async listDocsIdx (pattern: DocPattern, ix: number, comp: comparator, v?: number, fn? : Function) { return [] }
  async getHdr (v? : number) { return null }
  async insertHdr (row: Object) {}
  async updateHdr (row: Object) {}
  async getOrg (org: string, v?: number) { return null }
  async insertOrg (row: Object) {}
  async updateOrg (row: Object) {}
  async listOrgs (v?: number, fn? : Function) { return [] }  
  async listOrgsIdx (ix: number, comp: comparator, val: any, v?: number, fn? : Function) { return []}
  async purgeAllDocs (pattern: DocPattern) {}
  async purgeOrg (org: string, z?: number) {}
  async purgeOrgs (org: string, z: number) {}
  async purgeDlvDocs (pattern: DocPattern, ix, comp: comparator) {}
  async setFTP (org: string, path: string, dp: number) {}
  async purgeFTP (org: string, path: string) {}
  async listFTP (dp : number, fn: Function) {}
  async purgeAllFTP (dp : number) {}
  async nextTask (time: string) { return null }

}
