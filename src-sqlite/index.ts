import Database from 'better-sqlite3'
// import { Database } from './loadreq.js'

import { config } from '../src-fw/config'
import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric, zombiLapse, srvStatus, filter, expList, expListQ, row, rowQ, updType, pkv } from '../src-fw/iDbGeneric'
import { DocType, propType } from '../src-fw/doctypes'
import { AppExc } from '../src-fw/index'
import { Log } from '../src-fw/log'
import { Operation } from '../src-fw/operation'
import { Crypt } from '../src-fw/crypt'

import path from 'path'
import { existsSync } from 'node:fs'
import { writeFileSync } from 'node:fs'

const schemaPath = './sqlite/schema.sql'
const schemaPathd = './sqlite/delete.sql'

const t1 = `CREATE TABLE IF NOT EXISTS "STATUS" (
  "pk" TEXT,
  "at" INTEGER,
  "st" INTEGER,
  "txt"	TEXT,
PRIMARY KEY("pk"));
`

const t3 = `\t"data" BLOB,
PRIMARY KEY("org, pk"));` 

function t2 (cl: string) {
  const x = `CREATE TABLE IF NOT EXISTS "${cl}" (
  "org" TEXT,
  "pk" TEXT,
  "v" INTEGER,
  "ttl" INTEGER,` 
  return x
}

function t4 (prop: string, type: string) {
  const x = `\t"${prop}" ${type},` 
  return x
}

function t5 (cl: string, n: string) {
  const x = `CREATE INDEX IF NOT EXISTS "${cl}_${n}" ON "${cl}" ( "${n}" );` 
  return x
}

function t5w (cl: string, n: string) {
  const x = `CREATE INDEX IF NOT EXISTS "${cl}_${n}" ON "${cl}" ( "${n}" ) WHERE "${n}" > 0;` 
  return x
}

function t6 (cl: string, n: string) {
  const x = `
CREATE TABLE IF NOT EXISTS "${cl}@${n}" (
  "org" TEXT,
  "pk" TEXT,
  "v" INTEGER,
  "col" INTEGER,
  "ttl" INTEGER,
PRIMARY KEY("org, pk"));
CREATE INDEX IF NOT EXISTS "${cl}@${n}_org" ON "${cl}" ( "org" );
CREATE INDEX IF NOT EXISTS "${cl}@${n}_v" ON "${cl}" ( "v" );
CREATE INDEX IF NOT EXISTS "${cl}@${n}_col" ON "${cl}" ( "col" );
CREATE INDEX IF NOT EXISTS "${cl}@${n}_ttl" ON "${cl}" ( "ttl" )  WHERE "ttl" > 0;
`
  return x
}

const sqlTypes = [ 'TEXT', 'INTEGER', 'REAL', 'TEXT', 'TEXT' ]

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
    const l = []
    l.push(t1)
    for (const [,dt] of DocType.docTypes) {
      l.push('')
      const cl = dt.name.toUpperCase()

      l.push(t2(cl))
      if (dt.hasColls) for (const [n, x] of dt.colls) l.push(t4(n, 'TEXT'))
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) l.push(t4(n, sqlTypes[x.type]))
      l.push(t3)
      l.push(t5(cl, 'org'))
      l.push(t5(cl, 'v'))
      l.push(t5w(cl, 'ttl'))
      if (dt.hasColls) for (const [n, x] of dt.colls) l.push(t5(cl, n))
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) l.push(t5(cl, n))

      if (dt.hasColls) for (const [n, x] of dt.colls) l.push(t6(cl, n))
    }
    const t = l.join('\n')
    writeFileSync(path.resolve(schemaPath), Buffer.from(t, 'utf8'))
    console.log(schemaPath + ' written') 

    l.length = 0
    for (const [,dt] of DocType.docTypes) {
      l.push('')
      const cl = dt.name.toUpperCase()
      l.push('DELETE FROM ' + cl + ';')
      if (dt.hasColls) for (const [n, x] of dt.colls) 
        l.push('DELETE FROM ' + cl + '@' + n + ';')
    }
    const td = l.join('\n')
    writeFileSync(path.resolve(schemaPathd), Buffer.from(td, 'utf8'))
    console.log(schemaPathd + ' written') 

  }
}

export class SQLiteConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: SQLiteConnector, op: Operation, cryptKey?: string) {
    return new SQLiteConnexion(connector, op, cryptKey)
  }

  static dbCols = new Map<string, string[]>()
  public path: string
  public lastSql: string[]
  public sql: any
  
  columns (clazz: string) : string[] {
    let x = SQLiteConnexion.dbCols.get(clazz)
    if (!x) {
      const x = ['org', 'v', 'pk', 'ttl', 'data']
      const dt = DocType.get(clazz)
      if (dt.hasColls) for (const [n, ] of dt.colls) x.push(n)
      if (dt.hasIndexes) for (const [n, ] of dt.indexes) x.push(n)
      SQLiteConnexion.dbCols.set(clazz, x)
    }
    return x
  }

  constructor (connector: SQLiteConnector, op: Operation, cryptKey?: string) {
    super(connector, op, cryptKey)
    this.path = connector.path
    this.lastSql = []
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

  async getSrvStatus () :  Promise<srvStatus> {
    const stmt = this.sql.prepare('SELECT * FROM STATUS WHERE pk = \'1\'')
    const res = stmt.get()
    if (res) {
      res.now = this.op.now
      return res
    }
    return { now: this.op.now, st: 0, at: 0, txt: '(none)' }
  }

  async setSrvStatus (st: number, txt: string) :  Promise<srvStatus> {
    const stmt = this.sql.prepare('INSERT INTO STATUS (st, at, txt, pk) VALUES (@st, @at, @txt, \'1\') ON CONFLICT (pk) DO UPDATE SET st = excluded.st, at = excluded.at, txt = excluded.txt')
    stmt.run({ st, at: this.op.now, txt })
    return { now: this.op.now, st, at: this.op.now, txt }
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

  async commit () : Promise<void> {}

  /* Transforme un row DB en row APP et le retourne:
  - SAUF si son ttl dépassé
  - decrypte row.data
  */
  rowToAPP (row: row, nodecrypt?: boolean) : row | null{
    if (!nodecrypt && row.data) row.data = Crypt.syncDecrypt(this.key, row.data)
    return row
  }

  /* Transforme un row APP en row DB
  - calcul du TTL éventuel selon deleted et maxLife / now
  - crypt data, sauf si nocrypt
  Retourne le row
  */
  rowToDB (row: row, nocrypt?: boolean) : row {
    if (row.deleted) row.ttl = Math.floor(row.v / 60000) + Math.floor(zombiLapse / 60)
    else if (row.maxLife && (row.maxLife > this.op.now))
      row.ttl = row.maxLife
    delete row.deleted
    delete row.maxLife
    if (!nocrypt && row.data) row.data = Crypt.syncCrypt(this.key, row.data)
    return row
  }

  async exportRows (clazz: string, mark: string, limit: number) : Promise<expList> {
    const org = this.op.org
    let n = 0
    let lastMark = ''
    const rows: row[] = []
    const ttl = Math.floor(this.op.now / 60000)
    const stmt = this.sql.prepare('SELECT * FROM ' + clazz.toUpperCase() +
     ' WHERE org = @org AND pk > @mark AND ttl > @ttl ORDER BY pk DESC LIMIT @limit;')
    const docs = stmt.all({ org, mark, ttl, limit }) as row[]
    for (let doc of docs) {
      n++
      lastMark = doc.pk
      const row = this.rowToAPP(doc as row, true)
      if (row) rows.push(row)
    }
    return { rows, eox: n < limit, lastMark} 
  }

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  En SQL la purge est sans limite.
  */
  async purgeRows (clazz: string, limit: number) : Promise<boolean> {
    const org = this.op.org
    const stmt = this.sql.prepare('DELETE FROM ' + clazz.toUpperCase() + ' WHERE org = @org;')
    stmt.run({ org })
    return false
  }

  async importRows (clazz: string, rows: row[]) : Promise<void> {
    const cols = this.columns(clazz)
    const lx = []; cols.forEach(c => { lx.push('@' + c)})
    const stmt = this.sql.prepare('INSERT INTO ' + clazz.toUpperCase() + 
      ' (' + cols.join(', ') + ') VALUES (' + lx.join(', ') + ');')
    for(const row of rows) {
      const r = this.rowToDB(row, true)
      const obj = { org: this.op.org }
      if (r.ttl) obj['ttl'] = r.ttl
      cols.forEach(c => { obj[c] = r[c] })
      stmt.run(obj)
    }
  }

  async exportRowsQ (clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ> { 
      return null
  }

  async purgeRowsQ (clazz: string, colName: string, limit: number) : Promise<boolean> {
    return true
  }

  async importRowsQ (clazz: string, colName: string, rows: rowQ[]) : Promise<void> {
  }

  async writeRow (ut: updType, clazz: string, row: row) : Promise<void> {
  }

  async deleteRow (clazz: string, pk: string) : Promise<void> {
  }

  async writeRowQ (clazz: string, colName: string, row: rowQ) : Promise<void> {
  }

  async allRows (clazz: string, v: number) : Promise<Object[]> {
    return null
  }

  async oneRow (clazz: string, pk: string, v: number) : Promise<row | null> {
    return null
  }

  async getColl(clazz: string, 
    colName: string, col: string, isList: boolean, v: number) : Promise<[row[], pkv[]]> {
    return null
  }

  async selectDocs(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void> {
  }

  async selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void> {
  }

}
