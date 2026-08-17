import Database from 'better-sqlite3'

import { encode } from '@msgpack/msgpack'
import { config } from '../src/config'
import { IDbGeneric, zombiLapse, filter, expList, expListQ, 
  row, rowDB, rowQ, $CollData, $DCData, $DocData, updType, vdata, Safe,
  MDopn, MDuser, MDsetAA, MDsetS, MDdel, EventRow } from '../src-fw/iDbGeneric'
import { DocDescriptor, propType } from '../src-fw/docDescriptor'
import { topCl } from '../src-fw/registry'
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

const t3b = `\t"data" BLOB,
PRIMARY KEY(pk));` 

function t2 (cl: string) {
  const x = `CREATE TABLE IF NOT EXISTS "${cl}" (
  "org" TEXT,
  "pk" TEXT,
  "v" INTEGER,
  "ttl" INTEGER,` 
  return x
}

function t2b (cl: string) {
  const x = `CREATE TABLE IF NOT EXISTS "${cl}" (
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

function t6b (cl: string, n: string) {
  const x = `
CREATE TABLE IF NOT EXISTS "${cl}@${n}" (
  "pk" TEXT,
  "v" INTEGER,
  "col" TEXT,
  "ttl" INTEGER,
PRIMARY KEY(pk));
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
    for (const [fn, dt] of DocDescriptor.all) {
      if (dt.virtual) continue
      l.push('')
      const cl = fn.toUpperCase()
      const adm = dt.svc === 'ADMIN'

      l.push(adm ? t2b(cl) : t2(cl))
      if (dt.hasColls) for (const [n, x] of dt.colls) l.push(t4(n, 'TEXT'))
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) l.push(t4(n, sqlTypes[x.type]))
      l.push(adm ? t3b : t3)
      if (!adm) l.push(t5(cl, 'org'))
      l.push(t5(cl, 'v'))
      l.push(t5w(cl, 'ttl'))
      if (dt.hasColls) for (const [n, x] of dt.colls) l.push(t5(cl, n))
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) l.push(t5(cl, n))

      if (dt.hasColls) 
        for (const [n, c] of dt.colls) 
          if (c.mutable) l.push(adm ? t6b(cl, n) : t6(cl, n))
    }
    const t = l.join('\n')
    writeFileSync(path.resolve(schemaPath), Buffer.from(t, 'utf8'))
    Log.info(schemaPath + ' written') 

    l.length = 0
    for (const [fn, dt] of DocDescriptor.all) {
      l.push('')
      const cl = fn.toUpperCase()
      l.push('DELETE FROM ' + cl + ';')
      if (dt.hasColls) for (const [n, x] of dt.colls) 
        l.push('DELETE FROM ' + cl + '@' + n + ';')
    }
    const td = l.join('\n')
    writeFileSync(path.resolve(schemaPathd), Buffer.from(td, 'utf8'))
    Log.info(schemaPathd + ' written') 

  }
}

const opFilter = [ '<', '<=', '==', '!=', '>=', '>', 'IN', 'CONT1', 'CONT2']

export class SQLiteConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: SQLiteConnector, op: AbstractOperation, cryptKey?: string) {
    return new SQLiteConnexion(connector, op, cryptKey)
  }

  /* Pour chaque clazz, garde en cache les listes des colonnes pour la DB:
  - lc : set de TOUTES les colonnes
  - ll : set parmi celles-ci des colonnes liste
  */
  static dbCols = new Map<string, [Set<string>, Set<string>]>()
  public path: string
  public lastSql: string[]
  public sql: any
  
  /* Liste les colonnes APPLICATIVES pour la DB,
  AVEC les colonnes techniques { v pk ttl data et org si !adm}
  */
  columns (clazz: string, notech?: boolean) : [Set<string>, Set<string>] {
    let e = SQLiteConnexion.dbCols.get(clazz)
    if (!e) {
      const lc: Set<string> = new Set()
      const ll: Set<string> = new Set()
      const dt = DocDescriptor.get(topCl('', clazz))
      if (dt.hasColls) for (const [n, x] of dt.colls) {
        lc.add(n)
        if (x.list) ll.add(n)
      }
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) {
        lc.add(n)
        if (x.type === propType.LIST) ll.add(n)
      }
      e = [lc, ll]
      SQLiteConnexion.dbCols.set(clazz, e)
    }
    if (notech) return e
    const lc = e[0]
    const lc2 = new Set([...lc, 'pk', 'v', 'ttl', 'data'])
    if (!clazz.startsWith('ADMIN$')) lc2.add('org')
    return [lc2, e[1]]
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
  /* Retourne la map des urls par site, si modifiée après v (sinon [0, null])
  Par convention la "pseudo" org '1' est la map des urls des sites.
  */
  async mdGetValue (key: string, v: number) : Promise<[number, string]> { // [v, json] { s1: u1, s2: u2 ...}
    try {
      const stmt = this.sql.prepare('SELECT value, v FROM ZZVALUES WHERE key = @key AND v > @v;')
      let row = stmt.get({ key, v })
      return row ? [row.v, row.value] : [0, null]
    } catch (e: any) {
      throw new AppExc (108, 'masterdir_db_error_mdGetValue', null, [e])
    }
  } 

  async mdSetValue (key: string, v: number, value: string) : Promise<void> {
    try {
      const stmt = this.sql.prepare('INSERT INTO ZZVALUES ' +
        ' (key, v, value) VALUES (@key, @v, @value) ON CONFLICT (key) DO UPDATE SET v = excluded.v, value = excluded.value;')
      stmt.run({key, v, value})
    } catch (e: any) {
      throw new AppExc (108, 'masterdir_db_error_mdSetValue', null, [e])
    }
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
        Log.error('ROLLBACK exc :' + e2)
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

  isInvit (invit, row) {
    return invit && invit === row.hsha1 && !row.hsha2 && !row.C  && !row.V
  }

  readonly USERSCOLS = ['userId', 'hshK', 'hsha1', 'hsha2', 'C', 'V', 'llq', 'store']

  /* création d'une entrée dans 'users' pour un nouvel utilisateur.
  S'il existe déjà avec le même contenu, OK.
  Les alias ne doivent avoir déjà été attribués
  */
  async mdUserNew (mdUser: MDuser) : Promise<number> {
    let stmt = this.sql.prepare('SELECT * FROM ZZUSERS WHERE userId = @userId')
    let row = stmt.get( {userId: mdUser.userId} )
    if (mdUser.invit) {
      if (!row || mdUser.invit !== row.hsha1 || row.hshK || row.C || row.V) return 13
    } else {
      if (row) {
        if (this.eqObj(mdUser, row, this.USERSCOLS)) return 0
        return 12
      }
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
        Log.error('ROLLBACK exc :' + e2)
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

  /* Retourne un rowDB calculé depuis un row APP
  - calcul du TTL (EPOCH en MINUTES) éventuel selon deleted et maxLife / now
  - crypt data, sauf si nocrypt
  - ajoute les colonnes APPLICATIVES (coll et index)
    - transforme les propriétés "list" en string avec séparateur $
      pour recherche instr de SQL
  */
  rowToDB (clazz: string, row: row, org: string) : rowDB {
    // @ts-expect-error
    let rdb: rowDB = { pk: row.pk, v: row.v, ttl: 0 }
    if (org) rdb.org = org
    if (!row.data) { // deleted
      rdb.ttl = Math.floor(row.v / 60000) + zombiLapse, 0
    } else {
      const [lc, ll] = this.columns(clazz, true)
      lc.forEach(p => { 
        if (!ll.has(p)) rdb[p] = row[p] })
      ll.forEach(p => {
        const a = row[p]
        rdb[p] = a && a.length ? ('$' + a.join('$')) : ''
      })
      if (row.maxLife && (row.maxLife * 60000 > this.op.now))
        rdb.ttl = row.maxLife
      rdb.data = Crypt.syncCrypt(this.key, row.data)
    }
    return rdb
  }

  /* Transforme un row DB en row APP et le retourne:
  - si son ttl (en minutes) existe,
    - si dépassé : row.deleted est true
    - pas dépassé : converti en maxLife
  Si row.deleted: row.data est reconstitué NON crypté { deleted, v, _clazz, _pk }
  Sinon row.data est décrypté (ou non)
    _org?: string
    pk: string // primary key (hash)
    v: number // version: time de la dernière opération de création / maj / suppression
    maxLife?: number // time de fin de vie programmée par l'application (EPOCH en MINUTES)
    deleted?: boolean
    data: Uint8Array, // null si DELETED
  */
  rowToAPP (clazz: string, rdb: rowDB, org: string) : row{
    // @ts-expect-error
    const row: row = { pk: rdb.pk, v: rdb.v }
    if (org) row._org = org
    if (!rdb.data || (rdb.ttl && (rdb.ttl * 60000 < this.op.now))) {
      row.deleted = true
      row.data = encode({ deleted: true, v: rdb.v, _pk: rdb.pk, _clazz: clazz })
    } else {
      if (rdb.ttl) rdb.maxLife = rdb.ttl
      row.data = Crypt.syncDecrypt(this.key, Buffer.from(rdb.data))
    }
    return row
  }

  cluc (clazz: string) { return '"' + clazz.toUpperCase() + '"'}

  async exportRows (clazz: string, mark: string, limit: number) : Promise<expList> {
    const adm = clazz.startsWith('ADMIN$')
    let n = 0
    let lastMark = ''
    if (!mark) mark = '1'
    const rows: row[] = []
    const ttl = Math.floor(this.op.now / 60000)
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
     ' WHERE ' + (adm ? '' : 'org = @org AND ') + ' pk > @mark AND ttl > @ttl ORDER BY pk DESC LIMIT @limit;')
    const docs = stmt.all({ org: this.org, mark, ttl, limit }) as row[]
    for (let doc of docs) {
      n++
      lastMark = doc.pk
      const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
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
    const adm = clazz.startsWith('ADMIN$')
    const [lc, ] = this.columns(clazz)
    const lx = []; lc.forEach(c => { lx.push('@' + c)})
    const stmt = this.sql.prepare('INSERT INTO ' + this.cluc(clazz) + 
      ' (' + (Array.from(lc).join(', ')) + ') VALUES (' + lx.join(', ') + ');')
    const r = this.rowToDB(clazz, row, adm ? '' : this.org)
    stmt.run(r)
  }

  updRow (clazz: string, row: row) : void {
    const adm = clazz.startsWith('ADMIN$')
    if (row.data) { // c'est une vraie maj
      const [lc, ] = this.columns(clazz)
      const lx = []; lc.forEach(c => { lx.push(c + ' = @' + c)})
      const stmt = this.sql.prepare('UPDATE ' + this.cluc(clazz) + ' SET ' +
        lx.join(', ') + ' WHERE ' + (adm ? '' : 'org = @org AND ') + ' pk = @pk;')
      const r = this.rowToDB(clazz, row, adm ? '' : this.org)
      stmt.run(r)
    } else { // c'est une suppression (logique)
      const r = this.rowToDB(clazz, row, adm ? '' : this.org)
      const stmt = this.sql.prepare('UPDATE ' + this.cluc(clazz) + 
        ' SET v = @v, ttl = @ttl, data = NULL WHERE ' + (adm ? '' : 'org = @org AND ') + ' pk = @pk;')
      stmt.run(r)
    }
  }

  setRow (clazz: string, row: row) : void {
    const adm = clazz.startsWith('ADMIN$')
    const [lc, ] = this.columns(clazz)
    const lx = []; lc.forEach(c => { lx.push('@' + c)})
    const ly = []; lc.forEach(c => { 
      if (c !== 'pk' && c !== 'org') ly.push(c + ' = excluded.' + c)
    })
    const stmt = this.sql.prepare('INSERT INTO ' + this.cluc(clazz) + 
      ' (' + (Array.from(lc).join(', ')) + ') VALUES (' + lx.join(', ') + ')' +
      ' ON CONFLICT (org, pk) DO UPDATE SET ' + ly.join(', ') + ';')
    const r = this.rowToDB(clazz, row, adm ? '' : this.org)
    stmt.run(r)
  }

  /*
  delRow (clazz: string, row: row) : Promise<void> {
    const adm = clazz.startsWith('ADMIN$')
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) + 
    ' WHERE ' + (adm ? '' :  'org = @org AND ') + ' pk = @pk;')
    const obj = { pk: row.pk }
    if (!adm) obj.org = this.org
    stmt.run(obj)
  }
  */

  async exportRowsQ (clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ> { 
    const adm = clazz.startsWith('ADMIN$')
    let n = 0
    let lastMark = ''
    if (!mark) mark = '1'
    const rows: rowQ[] = []
    const ttl = Math.floor(this.op.now / 60000)
    const stmt = this.sql.prepare('SELECT * FROM "' + 
      this.cluc(clazz) + '@' + colName +
      '" WHERE ' + (adm ? '' :  'org = @org AND ') + ' pk > @mark AND ttl > @ttl ORDER BY pk DESC LIMIT @limit;')
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
    const adm = clazz.startsWith('ADMIN$')
    const stmt = this.sql.prepare('DELETE FROM ' + this.cluc(clazz) +
     ' WHERE ' + (adm ? '' :  'org = @org AND ') + ' pk = @pk;')
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
  INTEGRALE:
    - la collection est vide : v: 0 (datas dels sont absents)
    - la collection n'est PAS vide:
      - datas : liste des contenus des documents
      - v : version du document le plus récent de datas
  INCREMENTALE:
    - collection inchangée: v: 0 (datas dels sont absents)
    - collection changée: v et 1 ou 2 listes
      - v : version du changement le plus récent
      - datas :
        - ceux ajoutés à la collection depuis vs avec leur data complète
        - ceux qui sont dans la collection et ont changé depuis vs avec data complète
      - deleted : couples des [pk, v] des documents supprimés 
        où v est leur dh de supression
  */
  async allRowsData (clazz: string, v: number) : Promise<$CollData> {
    const adm = clazz.startsWith('ADMIN$')
    const incr = v !== 0
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
      ' WHERE ' + (adm ? '' : 'org = @org ') + (!incr ? ';' : ' AND v > @v ;'))
    const docs = stmt.all({org: this.org, v : v || 0})
    if (docs.length === 0) return { incr, v: 0 }

    const cd: $CollData = { incr, v: 0, datas: [], deleted: [] }
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
      if (row.v > cd.v) cd.v = row.v
      if (!incr) {
        if (!row.deleted) cd.datas.push(row.data)
      } else {
        if (!row.deleted) cd.datas.push(row.data)
        else cd.deleted.push([row.pk, row.v])
      }
    }
    return cd
  }

  /* Retourne LE document de la classe et pk indiqué:
  INTEGRAL: null si n'existe pas
  INCREMENTAL: null si n'existe pas OU inchangé depuis v
  */
  async oneRow (clazz: string, pk: string, v: number) : Promise<row | null> {
    const adm = clazz.startsWith('ADMIN$')
    const w = ' WHERE ' + (adm ? '' : 'org = @org AND ') + 'pk = @pk' + (!v ? ';' : ' AND v > @v ;')
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) + w)
    const doc = stmt.get({org: this.org, v : v || 0, pk })
    return !doc ? null : this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
  }

  async oneRowByAlias (clazz: string, alias: string, value: string) : Promise<row | null> {
    const adm = clazz.startsWith('ADMIN$')
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz) +
      ' WHERE ' + (adm ? '' :  'org = @org AND ') + alias + '= @value')
    const doc = stmt.get({org: this.org, value: value })
    if (!doc) return null
    const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
    return !row.deleted ? row : null
  }

  /* Retourne la sous-collection 'clazz/colName/colValue' des documents 
  (par exemple: Article/auteurs/Zola)
  INTEGRALE:
    - la collection est vide : v == 0 (datas datasM dels sont absents)
    - la collection n'est PAS vide:
      - datas : liste des contenus des documents
      - v : version du document le plus récent de datas
  INCREMENTALE:
    - collection inchangée: v: 0 (datas datasM dels sont absents)
    - collection changée: v et 1 à 3 listes
      - v : version du changement le plus récent
      - datas :
        - ceux ajoutés à la collection depuis vs avec leur data complète
        - ceux qui sont dans la collection et ont changé depuis vs avec data complète
      - moved : [Uint8Array] type 2 seulement
        - ceux ayant quitté la collection depuis vs avec leur data complète
      - deleted : couples des [pk, v] des documents supprimés 
        où v est leur dh de supression

  Exemple: Article, auteurs, sh(zola), true
    Collection des articles dont un des auteurs est Zola
    - dans moved: les articles qui ont eu Zola un jour et ne l'ont plus Zola depuis vs
    - dans deleted: pk de ceux supprimés à une dh > vs
  */
  async getColl(clazz: string, colName: string, val: string, isList: boolean, vs: number) 
    : Promise<$CollData> {
    const adm = clazz.startsWith('ADMIN$')
    const incr = vs !== 0
    const cd: $CollData = { incr, v: 0, datas: [], moved: [], deleted: [] }
    
    let stmt = this.sql.prepare('SELECT * FROM ' + 
      this.cluc(clazz) +
      ' WHERE ' + (adm ? '' :  'org = @org AND ') +
      (isList ? ('instr(' + colName + ', @col) > 0') : (colName + ' = @col') ) +
      (!incr ? ';' : ' AND v > @vs ;'))
    const docs = stmt.all({org: this.org, vs : vs || 0, val })

    if (docs.length === 0 && !incr) return { incr, v: 0 }
    
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
      if (row.v > cd.v) cd.v = row.v
      if (!row.deleted) cd.datas.push(row.data)
      if (incr && row.deleted) cd.deleted.push([row.pk, row.v])
    }
    if (!incr) return cd

    // INCREMENTAL : recherche des moved
    const ttl = Math.round(this.op.now / 60000)
    stmt = this.sql.prepare('SELECT pk, v FROM ' + 
      this.cluc(clazz) + '@' + colName +
      ' WHERE ' + (adm ? '' :  'org = @org AND ') + ' col = @col AND v > @vs AND ttl > @ttl;')
    // rowq des supprimés et/ou retirés de la collection 
    const rowqs = stmt.all({org: this.org, vs, val, ttl })
    // Pour ne garder par Article quitté que le départ le plus récent
    // un article pourrait avoir été "Zola" puis plus "Zola" puis à nouveau "Zola" puis plus "Zola" ...
    const m: Map<string, number> = new Map()

    for (const rowq of rowqs) {
      if (rowq.ttl * 60000 > this.op.now) {
        // les rowqs ont par principe toujours un ttl
        const v = rowq.v
        const pk = rowq.pk
        let vx = m.get(pk)
        if (vx || vx < v) m.set(pk, v)
      }
    }
    for (const [pk, v] of m) {
      if (v > cd.v) cd.v = v
      const r = await this.oneRow(clazz, pk, 0)
      if (r) cd.moved.push(r.data)
      else cd.deleted.push([pk, v])
    }
    return cd
  }

  compOp (colName: string, filter: filter, col: any) {
    const comp = opFilter[filter]
    if (comp === 'IN') {
      const l = []
      for (const x of col) l.push(x)
      const y = l.length ? '$' + l.join('$') : ''
      const z = colName + ' IN (\'' + y  + '\')'
      return z
    }
    if (!comp.startsWith('CONT')) return colName + ' ' + comp + ' @col'
    const cols = col instanceof Array ? col : [col]
    if (!cols.length) return ''
    const x = []
    for(const v of cols) x.push(' instr(' + colName + ', \'$' + v + '\') > 0 ')
    return x.length ?
      (x.length === 1 ? x[0] : ' ( (' + x.join(') OR (') + ') ) ')
      : ''
  }
  
  orderBy (order: string) {
    return order.startsWith('-') ? ' ORDER BY ' + order.substring(1) + ' DESC ' :
      ' ORDER BY ' + order + ' ASC '
  }

  async selectDocs(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void> {
    const adm = clazz.startsWith('ADMIN$')
    const w1 = adm ? ' WHERE ' : ' WHERE org = @org AND '
    const x = 'SELECT * FROM ' + this.cluc(clazz)
      + w1 + this.compOp(colName, filter, col)
      + (order ? this.orderBy(order) : '')
      + (limit ? ' LIMIT ' + limit : '') + ';'
    const stmt = this.sql.prepare(x)
    const docs = stmt.all({org: this.org, col })
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
      if (!row.deleted) await fn(row.data)
    }
  }

  async selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void> {
    const adm = clazz.startsWith('ADMIN$')
    const comp = opFilter[filter]
    const stmt = this.sql.prepare('SELECT * FROM ' + this.cluc(clazz)
      + ' WHERE ' + this.compOp(colName, filter, col)
      + this.orderBy(order)
      + (limit ? ' LIMIT ' + limit : '') + ';')
    const docs = stmt.all({org: this.org, col })
    for (let doc of docs) {
      const row = this.rowToAPP(clazz, doc as rowDB, adm ? '' : this.org)
      if (!row.deleted) fn(doc.org, row)
    }
  }

}
