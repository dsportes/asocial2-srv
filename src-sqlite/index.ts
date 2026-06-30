import Database from 'better-sqlite3'

import { encode, decode } from '@msgpack/msgpack'
import { config } from '../src-fw/config'
import { IDbGeneric, zombiLapse, filter, expList, expListQ, 
  row, rowQ, updType, vdata, Safe, MDTable, 
  MDopn, MDuser, MDsetAA, MDsetS, MDdel, EventRow } from '../src-fw/iDbGeneric'
import { DocType, propType } from '../src-fw/doctypes'
import { Log } from '../src-fw/log'
import { AppExc, AbstractOperation, OperationWC, DbConnector, DbConnexion } from '../src-fw/index'
import { Crypt } from '../src-fw/crypt'
import { Util } from '../src-fw/util'

import path from 'path'
import { existsSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
// import { MDEventS, MDEventU } from '../src-fw/masterdir'

const schemaPath = './sqlite/schema.sql'
const schemaPathd = './sqlite/delete.sql'

const t1 = `CREATE TABLE IF NOT EXISTS "SINGLETONS" (
  "key" TEXT,
  "value" TEXT,
PRIMARY KEY(key));

`

const t3 = `\t"data" BLOB,
PRIMARY KEY(org, pk));` 

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
  "col" TEXT,
  "ttl" INTEGER,
PRIMARY KEY(org, pk));
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
      throw new AppExc(110, 'SQLite_path_missing', null)
    this.path = path.resolve(p)
    if (!existsSync(this.path))
      throw new AppExc(110, 'SQLite_path_not_found', null, [this.path])
    Log.info('SQLite ' + ' DB path= [' + this.path + ']')
    this.factory = SQLiteConnexion.newConnexion
  }

  static async genSchema () {
    const l = []
    l.push(t1)
    for (const [,dt] of DocType.docTypes) {
      if (dt.virtual) continue
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

      if (dt.hasColls) 
        for (const [n, c] of dt.colls) 
          if (c.mutable) l.push(t6(cl, n))
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

const opFilter = [ '<', '<=', '==', '!=', '>=', '>', 'IN', 'CONT1', 'CONT2']

export class SQLiteConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: SQLiteConnector, op: AbstractOperation, cryptKey?: string) {
    return new SQLiteConnexion(connector, op, cryptKey)
  }

  static dbCols = new Map<string, string[][]>()
  public path: string
  public lastSql: string[]
  public sql: any
  
  columns (clazz: string) : string[][] {
    let e = SQLiteConnexion.dbCols.get(clazz)
    if (!e) {
      const lc = ['org', 'v', 'pk', 'ttl', 'data']
      const ll = []
      const dt = DocType.get(clazz)
      if (dt.hasColls) for (const [n, x] of dt.colls) {
        lc.push(n)
        if (x.list) ll.push(n)
      }
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) {
        lc.push(n)
        if (x.type === propType.LIST) ll.push(n)
      }
      e = [lc, ll]
      SQLiteConnexion.dbCols.set(clazz, e)
    }
    return e
  }

  constructor (connector: SQLiteConnector, op: AbstractOperation, cryptKey?: string) {
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
        if (config.debugLevel > 2) Log.debug(msg)
        this.lastSql.unshift(msg)
        if (this.lastSql.length > 3) this.lastSql.length = 3
      } 
    }

    try {
      this.sql = new Database(this.path, sqloptions), 
      this.sql.pragma('journal_mode = WAL')
    } catch (e) {
      throw new AppExc(108, 'SQLite_connexion_failed', this.op, [e.message])
    }
  }

  // Méthode PUBLIQUE de déconnexion, impérative et sans exception
  async disconnect () {
    try { this.sql.close() } catch (e2) { /* */ }
  }

  private trap (e: any) : [number, string] { // 1: busy, 0: OK - sinon exception
    if (e.constructor.name !== 'SqliteError') throw e
    if (e.code && !e.code.startsWith('SQLITE_BUSY')) throw e
    const s = (e.code || '???') + '\n' + (e.message || '') + '\n' + 
      (e.stack ? e.stack + '\n' : '') + this.lastSql.join('\n')
    return [1, s]
  }

  /******************************************************************************
  * Gestion du Master Directory  
  ******************************************************************************/

  async mdGet (st: MDTable, key: string, v: number) : Promise<[number, string]> {
    const stmt = this.sql.prepare('SELECT value, v FROM ' + st + ' WHERE key = @key AND v > @v;')
    let row = stmt.get({ key, v })
    return row ? [row.v, row.value] : null
  }

  async mdSet (st: MDTable, key: string, v: number, value: string) : Promise<void> {
    const stmt = this.sql.prepare('INSERT INTO ' + st +
      ' (key, v, value) VALUES (@key, @v, @value) ON CONFLICT (key) DO UPDATE SET value = excluded.value;')
    stmt.run({key, v, value})
  }

  async mdDel (st: MDTable, key: string) : Promise<void> {
    const stmt = this.sql.prepare('DELETE FROM ' + st + ' WHERE key = @key')
    stmt.run({ key })
  }

  async mdUserSet (opn: MDopn, args: MDuser | MDsetAA | MDsetS ) : Promise<number> {
    try {
      this.sql.exec('BEGIN;')
      let status = 0
      switch (opn) {
        case MDopn.new : { status = await this.mdUserNew(args as MDuser); break}
        case MDopn.setAA : { status = await this.mdUserSetAA(args as MDsetAA); break}
        case MDopn.setS : { status = await this.mdUserSetS(args as MDsetS); break}
        case MDopn.del : { status = await this.mdUserDel(args as MDdel); break}
      }
      this.sql.exec('COMMIT;')
      return status
    } catch (e: any) {
      try { 
        this.sql.exec('ROLLBACK;')
      } catch (e2) { 
        console.log('ROLLBACK exc :' + e2)
      }
      throw e
    }
  }

  normRow (row: any) : MDuser{
    const x = {}; for(const p of this.USERSCOLS) x[p] = row[p]
    if (!x['hsha1']) x['hsha1'] = ''
    if (!x['hsha2']) x['hsha2'] = ''
    const llq = Util.quarter(new Date())
    if (llq > x['llq']) {
      const stmt = this.sql.prepare('UPDATE ZZUSERS SET llq = @llq WHERE userId = @userId')
      stmt.run({ userId: row['userId'], llq })
      x['llq'] = llq
    }
    return x as MDuser
  }

  async mdAliasFree (alias: string) : Promise<boolean> {
    let stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE hsha1 = @alias')
    let row = stmt.get( {alias} )
    if (row) return false
    stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE hsha2 = @alias')
    row = stmt.get( {alias} )
    if (row) return false
    return true
  }

  async mdUserGet (userId: string, alias?: boolean) : Promise<MDuser | null> {
    let stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE userId = @userId')
    let row = stmt.get( {userId: userId} )
    if (row) return this.normRow(row)
    if (!alias) return null
    stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE hsha1 = @userId')
    row = stmt.get( {userId: userId} )
    if (row) return this.normRow(row)
    stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE hsha2 = @userId')
    row = stmt.get( {userId: userId} )
    if (row) return this.normRow(row)
    return null
  }

  /* Méthodes privées ************************************/
  eqObj (a: any, b: any, lp: string[]) {
    for (const p of lp) if (a[p] !== b[p]) return false
    return true
  }

  readonly USERSCOLS = ['userId', 'hshK', 'hsha1', 'hsha2', 'C', 'V', 'llq', 'store']

  /* création d'une entrée dans 'users' pour un nouvel utilisateur.
  S'il existe déjà avec le même contenu, OK.
  Les alias ne doivent avoir déjà été attribués
  */
  async mdUserNew (mdUser: MDuser) : Promise<number> {
    let stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE userId = @userId')
    let row = stmt.get( {userId: mdUser.userId} )
    if (row) { 
      if (this.eqObj(mdUser, row, this.USERSCOLS)) return 0
      return 12
    }
    stmt = this.sql.prepare('SELECT userId FROM ZZUSERS WHERE hsha1 = @hsha1 OR hsha2 = @hsha1')
    row = stmt.get( {hsha1: mdUser.hsha1} )
    if (row) return 11
    stmt = this.sql.prepare('SELECT userId FROM ZZUSERS WHERE hsha1 = @hsha2 OR hsha2 = @hsha2')
    row = stmt.get( {hsha2: mdUser.hsha2} )
    if (row) return 12
    const s1 = this.USERSCOLS.join(',')
    const s2 = this.USERSCOLS.join(', @')
    stmt = this.sql.prepare('INSERT INTO ZZUSERS (' + s1 + ') VALUES (@' + s2 + ');')
    const x = {}
    for(const p of this.USERSCOLS) x[p] = mdUser[p]
    if (x['hsha1'] === '') x['hsha1'] = null
    if (x['hsha2'] === '') x['hsha2'] = null
    stmt.run(x)
    return 0
  }

  mdUserId (args: any) : number {
    let stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE userId = @userId')
    let row = stmt.get( {userId: args.userId} )
    if (!row) return 1
    if (row.hshK !== args.hshK) return 2
    return 0
  }

  async mdUserSetAA (args: MDsetAA) : Promise<number> {
    const status = this.mdUserId(args); if (status) return status
    let stmt = this.sql.prepare('SELECT userId FROM ZZUSERS WHERE hsha1 = @hsha1 OR hsha2 = @hsha1')
    let row = stmt.get( {hsha1: args.hsha1} )
    if (row && row.userId !== args.userId) return 10
    stmt = this.sql.prepare('SELECT userId FROM ZZUSERS WHERE hsha1 = @hsha2 OR hsha2 = @hsha2')
    row = stmt.get( {hsha2: args.hsha2} )
    if (row && row.userId !== args.userId) return 11

    stmt = this.sql.prepare('UPDATE ZZUSERS SET ssha1 = @ssha1, ssha2 = @ssha2 ' +
      ' WHERE userId = @userId;')
    if (args['hsha1'] === '') args['hsha1'] = null
    if (args['hsha2'] === '') args['hsha2'] = null
    stmt.run(args)
    return 0
  }

  async mdUserSetS (args: MDsetS) : Promise<number> {
    const status = this.mdUserId(args); if (status) return status
    const stmt = this.sql.prepare('UPDATE ZZUSERS SET store = @store ' +
      ' WHERE userId = @userId;')
    stmt.run(args)
    return 0
  }

  async mdUserDel (args: MDdel) : Promise<number> {
    const status = this.mdUserId(args); if (status) return status
    const stmt = this.sql.prepare('DELETE FROM ZZUSERS WHERE userId = @userId;')
    stmt.run(args)
    return 0
  }

  async mdEventNew (row: EventRow) : Promise<void> {
    let stmt = this.sql.prepare('SELECT eventId FROM ZZEVENTS WHERE eventId = @eventId')
    let r = stmt.get( { eventId: row.eventId } )
    if (r) return
    stmt = this.sql.prepare('INSERT INTO ZZEVENTS (eventId, userId, v, maxLife, data)' +
      ' VALUES ( @eventId, @userId, @v, @maxLife, @data )')
    stmt.run({ eventId: row.eventId, userId: row.userId, v: row.v, maxLife: row.maxLife, data: row.data })
  }

  async mdEventGet (eventId: string ) : Promise<Uint8Array | null> {
    let stmt = this.sql.prepare('SELECT data FROM ZZEVENTS WHERE eventId = @eventId')
    let row = stmt.get( { eventId } )
    return row ? row.data : null
  }

  async mdEventSet (row: EventRow ) : Promise<void> {
    const stmt = this.sql.prepare('UPDATE ZZEVENTS SET v = @v, maxLife = @maxLife, data = @data' +
      ' WHERE eventId = @eventId')
    stmt.run(row)
  }

  async mdEventDel (eventId: string ) : Promise<void> {
    let stmt = this.sql.prepare('DELETE FROM ZZEVENTS WHERE eventId = @eventId')
    stmt.run( { eventId } )
  }

  async mdEventPurge (limit: number ) : Promise<void> {
    let stmt = this.sql.prepare('DELETE FROM ZZEVENTS WHERE maxLife > 0 AND maxLife < @limit')
    stmt.run( { limit } )
  }

  async mdEventList (userId: string) : Promise<Uint8Array[]> {
    const stmt = this.sql.prepare('SELECT data FROM ZZEVENTS WHERE userId = @userId')
    const l: Uint8Array[] = []
    const rows = stmt.all({ userId })
    for(const r of rows) l.push(r.data)
    return l
  }

  /******************************************************************************
  * Gestion des safe  
  ******************************************************************************/

  async getBinSafe (userId: string) : Promise<Uint8Array | null> {
    const stmt = this.sql.prepare('SELECT data FROM ZZSAFE WHERE userId = @userId')
    const row = stmt.get({userId})
    if (!row) return null
    return Crypt.syncDecrypt(this.key, row.data)
  }

  async newSafe (safe: Safe) : Promise<void> {
    const userId = safe.userId
    const llq = safe.auth.llq
    const data = Crypt.syncCrypt(this.key, encode(safe))
    const stmt = this.sql.prepare('INSERT INTO ZZSAFE (userId, llq, data) VALUES (@userId, @llq, @data)')
    stmt.run({ userId, llq, data })
  }

  async updSafe (safe: Safe) :  Promise<void> {
    const userId = safe.userId
    const llq = safe.auth.llq
    const data = Crypt.syncCrypt(this.key, encode(safe))
    const stmt = this.sql.prepare('UPDATE ZZSAFE SET llq = @llq, data = @data WHERE userId = @userId')
    stmt.run({ userId, llq, data })
  }

  async delSafe (userId: string) :  Promise<void> {
    const stmt = this.sql.prepare('DELETE FROM ZZSAFE WHERE userId = @userId')
    stmt.run({ userId })
  }

  async purgeSafes (llq: number) :  Promise<void> {
    const stmt = this.sql.prepare('DELETE FROM ZZSAFE WHERE llq < @llq')
    stmt.run({ llq })
  }

  /******************************************************************************
  Lecture de la map des organisations
  ******************************************************************************/
  async getSingleton (key: string) : Promise<string> {
    const stmt = this.sql.prepare('SELECT value FROM SINGLETONS WHERE key = @key')
    const res = stmt.get({key})
    return res ? res.value : ''
  }

  async setSingleton (key: string, value: string) : Promise<void> {
    const stmt = this.sql.prepare('INSERT INTO SINGLETONS (key, value) VALUES (@key, @value) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    stmt.run({key, value})
  }

  /******************************************************************************
  Opérations sur documents
  ******************************************************************************/

  async doTransaction () : Promise<[number, string]> {
    try {
      const opx = this.op as OperationWC
      this.transaction = true
      this.sql.exec('BEGIN;')
      await opx.transac()
      this.sql.exec('COMMIT;')
      this.transaction = false
      return [0, '']
    } catch (e) {
      try { 
        this.sql.exec('ROLLBACK;')
      } catch (e2) { 
        console.log('ROLLBACK exc :' + e2)
      }
      this.transaction = false
      return this.trap(e)
    }
  }

  async commit () : Promise<void> {}

  async  bug () : Promise<void> {
    const stmt = this.sql.prepare('INSERT INTO BUG (key, value) VALUES (@key, @value)')
    stmt.run({key: '1', value: '1'})
  }

  /* Transforme un row APP en row DB
  - calcul du TTL (EPOCH en MINUTES) éventuel selon deleted et maxLife / now
  - crypt data, sauf si nocrypt
  - transforme les propriétés "list" en string avec séparateur $
    pour recherche instr de SQL
  Retourne le row
  */
  rowToDB (clazz: string, row: row, nocrypt?: boolean) : row {
    if (!row.data) { // deleted
      row.ttl = Math.floor(row.v / 60000) + zombiLapse, 0
    } else {
      const [, ll] = this.columns(clazz)
      ll.forEach(p => {
        const a = row[p]
        row[p] = a && a.length ? ('$' + a.join('$')) : ''
      })
      if (row.maxLife) {
        if (row.maxLife * 60000 > this.op.now)
          row.ttl = row.maxLife
        delete row.maxLife
      }
    }
    if (!nocrypt && row.data) {
      const x = Crypt.syncCrypt(this.key, row.data)
      row.data = x
    }
    return row
  }

  /* Transforme un row DB en row APP et le retourne:
  - si son ttl (en minutes) existe,
    - si dépassé : row.deleted est true
    - pas dépassé : converti en maxLife
  Si row.deleted: row.data est reconstitué NON crypté { deleted, v, _clazz, _pk }
  Sinon row.data est décrypté (ou non)
  */
  rowToAPP (clazz: string, row: row, nodecrypt?: boolean) : row | null{
    let sec = 0
    if (row.ttl) { 
      sec = row.ttl * 60
      delete row.ttl
    }
    if (!row.data || (sec && (sec * 1000 < this.op.now))) {
      row.deleted = true
      row.data = encode({ deleted: true, v: row.v, _pk: row.pk, _clazz: clazz })
      return row
    }
    if (sec) row.maxLife = Math.floor(sec / 60)
    if (!nodecrypt) {
      const x = Crypt.syncDecrypt(this.key, Buffer.from(row.data))
      row.data = x
    }
    return row
  }

  cluc (clazz: string) { return '"' + clazz.toUpperCase() + '"'}

  async exportRows (clazz: string, mark: string, limit: number) : Promise<expList> {
    let n = 0
    let lastMark = ''
    if (!mark) mark = '1'
    const rows: row[] = []
    const ttl = Math.floor(this.op.now / 60000)
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
     ' WHERE org = @org AND pk > @mark AND ttl > @ttl ORDER BY pk DESC LIMIT @limit;')
    const docs = stmt.all({ org: this.org, mark, ttl, limit }) as row[]
    for (let doc of docs) {
      n++
      lastMark = doc.pk
      const row = this.rowToAPP(clazz, doc as row, true)
      if (!row.deleted) rows.push(row)
    }
    return { rows, eox: n < limit, lastMark} 
  }

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  En SQL la purge est sans limite.
  */
  async purgeRows (clazz: string, limit: number) : Promise<boolean> {
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) + ' WHERE org = @org;')
    stmt.run({ org: this.org })
    return false
  }

  async importRows (clazz: string, rows: row[]) : Promise<void> {
    for(const row of rows) this.insRow(clazz, row)
  }

  insRow (clazz: string, row: row) : void {
    const [cols, ] = this.columns(clazz)
    const lx = []; cols.forEach(c => { lx.push('@' + c)})
    const stmt = this.sql.prepare('INSERT INTO ' + this.cluc(clazz) + 
      ' (' + cols.join(', ') + ') VALUES (' + lx.join(', ') + ');')
    const r = this.rowToDB(clazz, row)
    const obj = { org: this.org, ttl: 0 }; 
    cols.forEach(c => { const x = r[c] ; if (x) obj[c] = x })
    stmt.run(obj)
  }

  updRow (clazz: string, row: row) : void {
    if (row.data) { // c'est une vraie maj
      const [cols, ] = this.columns(clazz)
      const lx = []; cols.forEach(c => { lx.push(c + ' = @' + c)})
      const stmt = this.sql.prepare('UPDATE ' + this.cluc(clazz) + ' SET ' +
        lx.join(', ') + ' WHERE org = @org AND pk = @pk;')
      const r = this.rowToDB(clazz, row)
      const obj = { org: this.org, ttl: 0 }; 
      cols.forEach(c => { const x = r[c] ; if (x) obj[c] = x })
      stmt.run(obj)
    } else { // c'est une suppression (logique)
      const r = this.rowToDB(clazz, row)
      r.org = this.org
      const stmt = this.sql.prepare('UPDATE ' + this.cluc(clazz) + 
        ' SET v = @v, ttl = @ttl, data = NULL WHERE org = @org AND pk = @pk;')
      stmt.run(r)
    }
  }

  setRow (clazz: string, row: row) : void {
    const [cols, ] = this.columns(clazz)
    const lx = []; cols.forEach(c => { lx.push('@' + c)})
    const ly = []; cols.forEach(c => { 
      if (c !== 'pk' && c !== 'org') ly.push(c + ' = excluded.' + c)
    })
    const stmt = this.sql.prepare('INSERT INTO ' + this.cluc(clazz) + 
      ' (' + cols.join(', ') + ') VALUES (' + lx.join(', ') + ')' +
      ' ON CONFLICT (org, pk) DO UPDATE SET ' + ly.join(', ') + ';')
    const r = this.rowToDB(clazz, row)
    const obj = { org: this.org, ttl: 0 }; 
    cols.forEach(c => { const x = r[c] ; if (x) obj[c] = x })
    stmt.run(obj)
  }

  /*
  delRow (clazz: string, row: row) : Promise<void> {
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) + 
    ' WHERE org = @org AND pk = @pk;')
    const r = this.rowToDB(clazz, row, true)
    const obj = { org: this.org, pk: row.pk }
    stmt.run(obj)
  }
  */

  async exportRowsQ (clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ> { 
    let n = 0
    let lastMark = ''
    if (!mark) mark = '1'
    const rows: rowQ[] = []
    const ttl = Math.floor(this.op.now / 60000)
    const stmt = this.sql.prepare('SELECT * FROM "' + 
      this.cluc(clazz) + '@' + colName +
      '" WHERE org = @org AND pk > @mark AND ttl > @ttl ORDER BY pk DESC LIMIT @limit;')
    const docs = stmt.all({ org: this.org, mark, ttl, limit }) as rowQ[]
    for (let doc of docs) {
      n++
      lastMark = doc.pk
      rows.push({ pk: doc.pk, col: doc.col, v: doc.v })
    }
    return { rows, eox: n < limit, lastMark} 
  }

  /* En SQL on ignore limit : tous les rows sont purgés en un statement */
  async purgeRowsQ (clazz: string, colName: string, limit: number) : Promise<boolean> {
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) + '@' + colName + ' WHERE org = @org ;')
    stmt.run({ org: this.org })
    return false
  }

  async importRowsQ (clazz: string, colName: string, rows: rowQ[]) : Promise<void> {
    for(const row of rows)
      this.writeRowQ (clazz, colName, row.pk, row.v, row.col)
  }

  writeRow (ut: updType, clazz: string, row: row) : void {
    switch (ut) {
      case updType.CREATE : { this.insRow(clazz, row); return }
      case updType.UPDATE : { this.updRow(clazz, row); return }
      case updType.SET : { this.setRow(clazz, row); return }
    }
  }

  deleteRow (clazz: string, pk: string) : void {
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) +
     ' WHERE org = @org AND pk = @pk;')
    stmt.run({ org: this.org, pk })
  }

  writeRowQ (clazz: string, colName: string, pk: string, v: number, col: string) : void {
    const stmt = this.sql.prepare('INSERT INTO "' + 
      this.cluc(clazz) + '@' + colName +
      '" (org, pk, v, col, ttl) VALUES (@org, @pk, @v, @col, @ttl)' +
      ' ON CONFLICT (org, pk) DO UPDATE SET ' +
      'v = excluded.v, col = excluded.col, ttl = excluded.ttl;')
    const x = { 
      pk, v, col, 
      org: this.org,
      ttl: Math.floor(v / 60000) + Math.floor(zombiLapse / 60)
    }
    stmt.run(x)
  }

  /* Retourne les data sérialisés de tous les rows de la classe indiquée:
  - si v = 0: tous ceux existant réellement à l'instant t.
  - sinon: ceux mis à jour ou zombifiés postérieueremt à v.
  */
  async allRowsData (clazz: string, v: number) : Promise<Uint8Array[]> {
    const datas: Uint8Array[] = []
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
      ' WHERE org = @org ' + (!v ? ';' : ' AND v > @v ;'))
    const docs = stmt.all({org: this.org, v : v || 0})
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as row)
      if (v || !row.deleted) datas.push(row.data)
    }
    return datas
  }

  async oneRow (clazz: string, pk: string, v: number) : Promise<row | null> {
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
      ' WHERE org = @org AND pk = @pk' + (!v ? ';' : ' AND v > @v ;'))
    const doc = stmt.get({org: this.org, v : v || 0, pk })
    if (!doc) return null
    const row = this.rowToAPP(clazz, doc as row)
    return v || !row.deleted ? row : null
  }

  async oneRowByAlias (clazz: string, alias: string, value: string) : Promise<row | null> {
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
      ' WHERE org = @org AND ' + alias + '= @value')
    const doc = stmt.get({org: this.org, value: value })
    if (!doc) return null
    const row = this.rowToAPP(clazz, doc as row)
    return !row.deleted ? row : null
  }

  /* Retourne la sous-collection 'clazz/colName/colValue' des documents 
  (par exemple: Article/auteurs/Zola)
  - si vs est absent: connue actuellement (à now)
  - sinon documents ajoutés ou partis de la sous-collection (ou zombifiés) 
    depuis la version vs de la sous-collection connue en session.
  Retour: liste des documents (leur version la plus récente). 
  - Certains d'entre eux peuvent ne plus appartenir à la collection ou être zombi
    (à vérifier en session).
  */
  async getColl(clazz: string, colName: string, col: string, isList: boolean, vs: number) 
    : Promise<Uint8Array[]> {

    // Map des documents par pk
    const m: Map<string, vdata> = new Map<string, vdata>()
    const datas: Uint8Array[] = []

    let stmt = this.sql.prepare('SELECT * FROM ' + 
      this.cluc(clazz) +
      ' WHERE org = @org AND ' +
      (isList ? ('instr(' + colName + ', @col') : (colName + ' = @col') ) +
      (!vs ? ';' : ' AND v > @vs ;'))
    const docs = stmt.all({org: this.org, vs : vs || 0, col })
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as row)
      if (!vs) {
        if (!row.deleted) datas.push(row.data)
      } else {
        if (!row.deleted) m.set(row.pk, { v: row.v, data: row.data })
      }
    }
    if (!vs) return datas

    const ttl = Math.round(this.op.now / 60000)
    stmt = this.sql.prepare('SELECT pk, v FROM ' + 
      this.cluc(clazz) + '@' + colName +
      ' WHERE org = @org AND col = @col AND v > @vs AND ttl > @ttl;')
    const rowqs = stmt.all({org: this.org, vs: vs || 0, col, ttl })
    for (const rowq of rowqs) {
      if (rowq.ttl * 60000 > this.op.now) {
        const v = rowq.v
        const pk = rowq.pk
        const vd = m.get(pk)
        if (!vd || (v > vd.v)) {
          const r = await this.oneRow(clazz, pk, vs)
          m.set(pk, { v: r.v, data: r.data })
        }
      }
    }
    for(const [, {data}] of m) datas.push(data)
    return datas
  }

  compOp (colName: string, filter: filter, col: any) {
    const comp = opFilter[filter]
    if (!comp.startsWith('CONT')) return 'AND ' + colName + ' ' + comp + ' @col'
    const cols = col instanceof Array ? col : [col]
    if (!cols.length) return ''
    const x = []
    for(const v of cols) x.push(' instr(' + colName + ', \'' + v + '\') > 0 ')
    return x.length ?
      ' AND ' + (x.length === 1 ? x[0] : ' ( (' + x.join(') OR (') + ') ) ')
      : ''
  }
  
  orderBy (order: string) {
    return order.startsWith('-') ? ' ORDER BY ' + order.substring(1) + ' DESC ' :
      ' ORDER BY ' + order + ' ASC '
  }

  async selectDocs(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void> {
    const x = 'SELECT * FROM ' + this.cluc(clazz)
      + ' WHERE org = @org ' + this.compOp(colName, filter, col)
      + (order ? this.orderBy(order) : '')
      + (limit ? ' LIMIT ' + limit : '') + ';'
    const stmt = this.sql.prepare(x)
    const docs = stmt.all({org: this.org, col })
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as row)
      if (!row.deleted) await fn(row.data)
    }
  }

  async selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void> {
    const comp = opFilter[filter]
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz)
      + ' WHERE ' + this.compOp(colName, filter, col)
      + this.orderBy(order)
      + (limit ? ' LIMIT ' + limit : '') + ';')
    const docs = stmt.all({org: this.org, col })
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as row)
      if (!row.deleted) fn(doc.org, row)
    }
  }

}
