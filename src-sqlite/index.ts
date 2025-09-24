import Database from 'better-sqlite3'
// import { Database } from './loadreq.js'

import { config } from '../src-fw/config'
import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric, filter, expList, expListQ, row, rowQ, updType, pkv } from '../src-fw/iDbGeneric'
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

  static async genSchema () {
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
        if (config.debugLevel === 2) Log.debug(msg)
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

  async getSrvStatus () :  Promise<[number, number, string]> {
    return [0, 0, '']
  }

  async setSrvStatus (st: number, at: number, txt: string) :  Promise<void> {}
  
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

  async commit () : Promise<void> {}

  _stmt (code: string, sql: string) {
    let s = this.cachestmt[code]
    if (!s) {
      if (!sql) return null
      s = this.sql.prepare(sql)
      this.cachestmt[code] = s
    }
    return s
  }

  async exportRows (org: string, clazz: string, mark: string, limit: number) : Promise<expList> {
    return null
  }

  async purgeRows (org: string, clazz: string, limit: number) : Promise<boolean> {
    return true
  }

  async importRows (org: string, clazz: string, rows: row[]) : Promise<void> {
  }

  async exportRowsQ (org: string, clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ> { 
      return null
  }

  async purgeRowsQ (org: string, clazz: string, colName: string, limit: number) : Promise<boolean> {
    return true
  }

  async importRowsQ (org: string, clazz: string, colName: string, rows: rowQ[]) : Promise<void> {
  }

  async writeRow (ut: updType, org: string, clazz: string, row: row) : Promise<void> {
  }

  async deleteRow (org: string, clazz: string, pk: string) : Promise<void> {
  }

  async writeRowQ (org: string, clazz: string, colName: string, row: rowQ) : Promise<void> {
  }

  async allRows (org: string, clazz: string, v: number) : Promise<Object[]> {
    return null
  }

  async oneRow (org: string, clazz: string, pk: string, v: number) : Promise<row | null> {
    return null
  }

  async getColl(org: string, clazz: string, 
    colName: string, col: string, isList: boolean, v: number) : Promise<[row[], pkv[]]> {
    return null
  }

  async selectDocs(org: string, clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void> {
  }

  async selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void> {
  }

  /*
  async getDoc (pattern: DocPattern, v?: number) : Promise<Uint8Array> { return null }
  async insertDoc (row: Object) {}
  async updateDoc (row: Object) {}
  async listDocs (pattern: DocPattern, v?: number, fn? : Function) { return [] }
  async listDocsSk (pattern: DocPattern, ik: number, v?: number, fn? : Function) { return [] }
  async listDocsIdx (pattern: DocPattern, ix: number, comp: filter, v?: number, fn? : Function) { return [] }
  async getHdr (v? : number) { return null }
  async insertHdr (row: Object) {}
  async updateHdr (row: Object) {}
  async getOrg (org: string, v?: number) { return null }
  async insertOrg (row: Object) {}
  async updateOrg (row: Object) {}
  async listOrgs (v?: number, fn? : Function) { return [] }  
  async listOrgsIdx (ix: number, comp: filter, val: any, v?: number, fn? : Function) { return []}
  async purgeAllDocs (pattern: DocPattern) {}
  async purgeOrg (org: string, z?: number) {}
  async purgeOrgs (org: string, z: number) {}
  async purgeDlvDocs (pattern: DocPattern, ix, comp: filter) {}
  async setFTP (org: string, path: string, dp: number) {}
  async purgeFTP (org: string, path: string) {}
  async listFTP (dp : number, fn: Function) {}
  async purgeAllFTP (dp : number) {}
  async nextTask (time: string) { return null }
*/

}
