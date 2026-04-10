import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
import { Crypt, keyFromB64 } from './crypt'
import { Util } from './util'
import { Safe, safeTable } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'

type Device = {
  devName: string | Uint8Array
  Va: string
  cy: string
  sign: Uint8Array
  nbe: number
}

export type ICVO = { // Clé: userId
  i: string // userId
  c: string // clé publique C de cryptage en base64
  v: string // clé publique V de vérification en base64
  o: string // code de l'opérateur hébergeant son safe
}

/****************************************************** 
 * Pour le Safe GENERIQUE seulement 
*******************************************************/
export type CVO = { // Clé: userId
  c: string // clé publique C de cryptage en base64
  v: string // clé publique V de vérification en base64
  o: string // code de l'opérateur hébergeant son safe
}

type Dobj = {
  at: number, // date-heure de lecture
  v: number, // version: date-heure de dernière mise à jour
  val: CVO | Object // selon la table
  /* 
    users => Clé userId => DobjU
    orgs: Clé org => { svc1:OP1, svc2:OP2 ...}
    svcops: clé svc => { OP1:url1, OP2: url2 ...}
  */
}

class SafeCache {
  static users : Map<string, Dobj> = new Map()
  static svcops : Map<string, Dobj> = new Map()
  static orgs : Map<string, Dobj> = new Map()
  static maxLife = 3 * 60

  /* Retourne l'objet associé à la table USERS / SVCOPS / ORGS
  - soit trouvé en cache et d'age correct
  - soit (re)lu de la table et gardé en cache
  */
  static async get(op: Operation, st: safeTable, id: string) 
  : Promise<Object | CVO | null> {
    const now = Math.floor(Date.now() / 1000)
    let e: Dobj
    switch (st) {
      case safeTable.USERS : { e = SafeCache.users.get(id); break }
      case safeTable.SVCOPS : { e = SafeCache.svcops.get(id); break }
      case safeTable.ORGS : { e = SafeCache.orgs.get(id); break }
    }
    if (!e || e.at < now - SafeCache.maxLife) { // pas trouvé en cache ou trop vieux
      const x = await op.db.safeGet(st, id, 0)
      if (!x) {
        e = { at: now, v: 0, val: null}
      } else {
        let y = null
        try { y = JSON.parse(x[1]) } catch(e) { console.log(e) }
        e = { at: now, v: y ? x[0] : 0, val: y }
      }
      switch (st) {
        case safeTable.USERS : { SafeCache.users.set(id, e); break }
        case safeTable.SVCOPS : { SafeCache.svcops.set(id, e); break }
        case safeTable.ORGS : { SafeCache.orgs.set(id, e); break }
      }
    }
    return e.val
  }

  /* Sauvegarde l'objet associé à la table USERS / SVCOPS / ORGS pour la table et l'ID spéciées.
  Si val est null, supprime l'entrée. 
  Toutefois en cache l'entrée existe toujours avec une val null pour évier une relecture
  en base en cas de redemande.
  */
  static async set(op: Operation, st: safeTable, id: string, val: Object | CVO)
    : Promise<void> {

    const now = Math.floor(Date.now() / 1000)
    const e = { at: now, v: now, val }
    if (val) {
      const value: string = JSON.stringify(val)
      await op.db.safeSet(st, id, now, value)
    } else await op.db.safeDel(st, id)
    switch (st) {
      case safeTable.USERS : { SafeCache.users.set(id, e); break }
      case safeTable.SVCOPS : { SafeCache.svcops.set(id, e); break }
      case safeTable.ORGS : { SafeCache.orgs.set(id, e); break }
    }    
  }
}

/* Appel direct d'une opération: 
  const result = await SafeOperation.doOp(opName, args)
*/
export class SafeOperation extends Operation {
  static factories = new Map<string, Function>()

  static register (opName: string, factory: Function) {
    SafeOperation.factories.set(opName, factory)
  }

  static cacheIcvo: Map<string, ICVO> = new Map()

  /* Depuis l'intérieur d'une opération, soumet une opération (opName, args) de safe
  au safe 'safeStore'*/
  static async postToSafe (op: Operation, opName: string, args: Object, safeStore?: string)
   : Promise<Object> {
    let u = config.MASTERDIR
    if (safeStore) {
      const x = await SafeCache.get(op, safeTable.SVCOPS, 'SAFE') as Object
      u = x ? x[safeStore] : null
    }
    if (!u)
      throw new AppExc(3005, 'postToSafe error', null, [op.opName, safeStore])
    const url = u + '/safe/' + opName
    const body = new Uint8Array(encode(args))
    try {
      const response = await fetch(url , {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',  // sent request
          'Accept':       'application/octet-stream'   // expected data sent back
        },
        body,
      })
      const buf = await response.bytes()
      const obj = decode(buf)
      if (response.status === 200) return obj
      throw new AppExc(3003, 'masterdir error', null, [op.opName, opName, '' + response.status])
    } catch(e) {
      if (e instanceof AppExc) throw e
      throw new AppExc(3003, 'masterdir error', null, [op.opName, opName, e.message])
    }
  }

  // Obtient le icvo d'un userId depuis le MASTERDIR ou un SafeStore explicitement cité
  static async userICVO (op: Operation, userId: string, safeStore?: string) 
    : Promise<ICVO | null> {
    const e = SafeOperation.cacheIcvo.get(userId)
    if (e) return e
    const ret = await SafeOperation.postToSafe(op, '$GetUserICVO', { userId }, safeStore)
    const icvo = ret['icvo']
    if (icvo) {
      SafeOperation.cacheIcvo.set(userId, icvo)
      return icvo
    }
    return null
  }
  
  static async doOp (opName: string, args: Object) : Promise<Object> {
    const f = SafeOperation.factories.get(opName)
    if (!f) throw new AppExc(1002, 'unknown operation', null, [opName])
    const op = f()
    op.opName = opName
    op.args = args
    op.result = { }
    try {
      await config.safeDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e) {
      await op.db.disconnect()
      throw(e)
    }
  }

  cleanInvits (safe: any) {
    if (!safe.invits) return safe
    const d = Math.floor(Date.now() / 86400000)
    let b = false
    for(const xid of Array.from(Object.keys(safe.invits))) {
      const x = safe.invits[xid]
      const d2 = Math.floor(x.time / 86400)
      if (d2 < (d - 7)) delete(safe.invits[xid])
      else b = true
    }
    if (!b) delete safe.invits
  }

  async getSafe (arg: Object): Promise<Safe> {
    const [m, safe] = await this.db.getSafe(arg['userId'])
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return null
    }

    if (arg['shk'] && safe.hhk === Crypt.shaS(Util.b64ToU8(arg['shk'])))
      return safe

    let ok = false
    const sh1p = Util.b64ToU8(arg['sh1p'])
    const sh1r = Util.b64ToU8(arg['sh1r'])
    if (sh1p && safe.hhp1 === Crypt.shaS(sh1p)) ok = true
    else if (sh1r && safe.hhr1 === Crypt.shaS(sh1r)) ok = true
    if (ok) return safe
    
    this.setRes('status', 2)
    await Util.sleep(3000)
    return null
  }

  constructor () { super() }

  async doTheJob () : Promise<void> {  }

  /* Retourne les paramètres d'une opération d'Administration du Safe
  - userId doit être enregistré dans la configuration SAFEADMINUSERS ou ADMINUSERS
  - params: string[] - Par exemple: [SVC, $OP, org] [SVC, $OP, url] ...
  - time: date-heure de la requête
  - sign: signature par la clé S de userId de encode([time, params])
  Retourne "params" en cas de succès.
  */
  async getParams (args: Object) : Promise<string[]> {
    const userId = args['userId']
    const time = args['time']
    // const now = Date.now()
    // if (time < now - 3000 || time > now + 3000) throw new AppExc(2003, 'no safe admin', this)
    if (config.MASTERDIRADMINUSERS.has(userId)) {
      const params = args['params']
      const sign = args['sign']
      const obj = await SafeCache.get(this, safeTable.USERS, userId) as CVO
      if (obj) {
        const ch = encode([time, params])
        try {
          const b = await Crypt.verify(keyFromB64(obj.v), sign, ch)
          if (b) return params
        } catch (e) {
          console.log(e)
        }
      }
    }
    throw new AppExc(2002, 'no safe admin', this)
  }
}

/****************************************************** 
 * Pour le StoreSafe GENERIQUE seulement 
*******************************************************/

/* Déclare l'URL d'un service pour un opérateur. args: 
- userId: un ADMINISTRATEUR du StoreSafe générique
- params: [SVC, $OP, url] - url vide, supprime l'entrée
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])
*/
class $SetOpUrl extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const [SVC, $OP, url] = await this.getParams(this.args)
    let obj = await SafeCache.get(this, safeTable.SVCOPS, SVC) as Object
    if (obj) {
      if (url) obj[$OP] = url
      else {
        delete obj[$OP]
        if (Array.from(Object.entries(obj)).length === 0) obj = null
      }
    } else {
      if (url) obj = { $OP: url }
    }
    await SafeCache.set(this, safeTable.SVCOPS, SVC, obj)
  }
}
SafeOperation.register('$SetOpUrl', () => { return new $SetOpUrl()})

/* Enregistre qu'une organisation est hébergée par l'opérateur $OP pour un service SVC
Si $OP est null, l'organisation est révoquée pour ce service.
args:
- userId: un ADMINISTRATEUR du StoreSafe générique
- params: [SVC, $OP, org]
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])
*/
class $GrantSvcOpOrg extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const [SVC, $OP, org] = await this.getParams(this.args)
    if (SVC) { // Contrôle de l'existence de SVC et de son hébergement par OP
      const obj = await SafeCache.get(this, safeTable.SVCOPS, SVC)
      if (!obj || !obj[$OP])
        throw new AppExc(2004, 'svc unkown or not implemented by $OP', this, [SVC, $OP, org])
    }
    let obj = await SafeCache.get(this, safeTable.ORGS, org) as Object
    if (obj) {
      if ($OP) obj[SVC] = $OP
      else {
        delete obj[SVC]
        if (Array.from(Object.entries(obj)).length === 0) obj = null
      }
    } else {
      if ($OP) obj = { SVC: $OP }
    }
    await SafeCache.set(this, safeTable.ORGS, org, obj)
  }
}
SafeOperation.register('$GrantSvcOpOrg', () => { return new $GrantSvcOpOrg()})

/* Révoque une organisation pour l'opérateur $OP pour un service SVC
args:
- userId: un ADMINISTRATEUR du StoreSafe générique
- params: [SVC, $OP, org]
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])

class $RevokeSvcOpOrg extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const [SVC, $OP, org] = await this.getParams(this.args)
    let obj = await SafeCache.get(this, safeTable.URLS, SVC)
    if (!obj || !obj[$OP])
      throw new AppExc(2004, 'not hosted org', this, [SVC, $OP, org])
    obj = await SafeCache.get(this, safeTable.ORGS, org)
    if (obj) delete obj[SVC]
    if (Array.from(Object.keys(obj)).length)
      await SafeCache.set(this, safeTable.ORGS, org, obj)
    else
      await SafeCache.del(this, safeTable.ORGS, org)
  }
}
SafeOperation.register('$RevokeSvcOpOrg', () => { return new $RevokeSvcOpOrg()})
*/

/* Retourne les clés publiques et l'opérateur hébergeant le safe
de l'argument userId. Retour: cvo ou rien si non trouvé
{
  c: string // clé publique C de cryptage en base64
  v: string // clé publique V de vérification en base64
  o: string // code de l'opérateur hébergeant son safe
}
*/
class $GetUserCVO extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const cvo = await SafeCache.get(this, safeTable.USERS, userId) as CVO
    if (cvo) this.setRes('cvo', cvo)
  }
}
SafeOperation.register('$GetUserCVO', () => { return new $GetUserCVO()})

/* Enregistre dans le dépôt générique des Safes 
les clés publiques et l'opérateur gérant le safe d'un userId à sa création. 
Args: userId, { c, v, o }
Opération NON gardée: suppose de n'être invoquée QUE par 
l'opération de création d'un Safe ou de changement d'opérateur de Safe.
o est '' (pas null) si c'est le Safe Store standard.
*/
class $SetUserICVO extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const icvo = this.args['icvo'] as CVO
    await SafeCache.set(this, safeTable.USERS, userId, icvo)
  }
}
SafeOperation.register('$SetUserICVO', () => { return new $SetUserICVO()})

/* Retourne l'URL d'accès à un service SVC hébergé par un opérateur $OP
class $GetSvcOpUrl extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const SVC = this.args['SVC'] as string
    const $OP = this.args['$OP'] as string
    const obj = await SafeCache.get(this, safeTable.URLS, SVC)
    this.setRes('url', obj ? (obj[$OP] ? obj[$OP].url : '') : '')
  }
}
SafeOperation.register('$GetSvcOpUrl', () => { return new $GetSvcOpUrl()})
*/

/* Pour une liste de services, retrourne une map avec une entrée par service:
Cette entrée est une map donnant par opérateur, son URL
*/
class $GetSvcUrls extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const l = this.args['lsvc'] as string[]
    const urls = {}
    for(const svc of l) {
      const obj = await SafeCache.get(this, safeTable.SVCOPS, svc)
      if (obj) urls[svc] = obj
    }
    this.setRes('urls', urls)
  }
}
SafeOperation.register('$GetSvcUrls', () => { return new $GetSvcUrls()})

/* Pour une organisation donnée, retrourne une map avec une entrée par service
donnant l'opérateur qui en assure l'hébergement.
*/
class $GetOrgSvcs extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const org = this.args['org'] as string
    const svcs = await SafeCache.get(this, safeTable.ORGS, org)
    if (svcs) this.setRes('svcs', svcs)
  }
}
SafeOperation.register('$GetOrgSvcs', () => { return new $GetOrgSvcs()})

/* Retourne couple [url, $OP] d'accès à un service SVC hébergeant une organisation org
- $OP est l'opérateur hébergeur de l'organisation pour ce service
class $GetSvcOrgUrl extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const SVC = this.args['SVC'] as string
    const org = this.args['org'] as string
    const obj = await SafeCache.get(this, safeTable.ORGS, org)
    let url: string = ''
    let $OP: string = ''
    if (obj && obj[SVC]) {
      $OP = obj[SVC]
      const obj2 = await SafeCache.get(this, safeTable.URLS, SVC)
      if (obj2) url = (obj2[$OP] ? obj2[$OP].url : '')
    } 
    this.setRes('urlOp', [url, $OP])
  }
}
SafeOperation.register('$GetSvcOrgUrl', () => { return new $GetSvcOrgUrl()})
*/

/***************************************************************
 * Opérations applicables aussi aux SafeStore "spécifiques"
 ***************************************************************/
export type SafeCodes = { // paramétres de l'opération $UpdCodesSafe
  id: string // identifiant aléatoire.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA de `SH(p1)`.
  hhr1: string // SHA de `SH(r1)`.
  Ka: string // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: string //  clé `K` du safe cryptée par `SH(r0, r1)`.
}

/* Creation d'un nouveau Safe
*/
class $CreateSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    const ret = await this.db.newSafe(safe)
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$CreateSafe', () => { return new $CreateSafe()})
/* Restauration d'un Safe
*/
class $RestoreSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe'] as Safe
    this.cleanInvits(safe)
    const ret = await this.db.restoreSafe(safe)
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$RestoreSafe', () => { return new $RestoreSafe()})

/* Copie binaire du Safe args: userId shk
*/
class $GetBinSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [m, bin] = await this.db.getBinSafe(this.args['userId'])
    const hhk = Crypt.shaS(Util.b64ToU8(this.args['shk']))
    const safe = decode(bin) as Safe
    if (safe && hhk === safe.hhk) {
      this.setRes('status', 0)
      this.cleanInvits(safe)
      this.setRes('safe', safe)
    } else {
      this.setRes('status', 1)
      await Util.sleep(3000)
    }
  }
}
SafeOperation.register('$GetBinSafe', () => { return new $GetBinSafe()})

/* Mise à jour des codes d'accès d'un Safe
*/
class $UpdCodesSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safeNew = this.args['safeCodes'] as SafeCodes
    const [m, safe] = await this.db.getSafe(safeNew.id)
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }

    safe.hp0 = safeNew.hp0
    safe.hr0 = safeNew.hr0
    safe.hhp1 = safeNew.hhp1
    safe.hhr1 = safeNew.hhr1
    safe.Ka = safeNew.Ka
    safe.Kr = safeNew.Kr
    this.cleanInvits(safe)
    const ret = await this.db.updPRSafe(safe)
    this.setRes('status', ret)
    if (ret !== 0) await Util.sleep(3000)
    else this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdCodesSafe', () => { return new $UpdCodesSafe()})

/* Ouverture d'un Safe
- sh0: sh (binaire) de la partie pseudo
- sh1: sh (binaire) de la partie phrase
status 0: OK, 1:pseudo non reconnu
byP: quand status 0, true si accès "primaire" (sinon "secondaire")
safe: quand status 0, le safe
*/
class $OpenSafeByPR extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    let byP = false
    let status = 1
    const s0 = this.args['sh0']
    let [m, safe] = await this.db.getSafe(s0)
    if (!safe) {
      status = 3
      byP = false
      safe = null
    } else {
      const hh1 = Crypt.shaS(Util.b64ToU8(this.args['sh1']))
      if (m === 1 && safe.hhp1 === hh1) {
        byP = true
        status = 0
      } else if (m === 2 && safe.hhr1 === hh1) {
        byP = false
        status = 0
      } else {
        status = 3
        byP = false
        safe = null
      }
    }
    this.cleanInvits(safe)
    this.setRes('status', status)
    this.setRes('safe', safe)
    this.setRes('byP', byP)
    if (status !== 0) await Util.sleep(3000)
  }
}
SafeOperation.register('$OpenSafeByPR', () => { return new $OpenSafeByPR()})

/* Ouverture d'un Safe
*/
class $OpenSafeById extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [m, safe] = await this.db.getSafe(this.args['userId'])
    const hhk = Crypt.shaS(Util.b64ToU8(this.args['shk']))
    if (safe && hhk === safe.hhk) {
      this.cleanInvits(safe)
      this.setRes('status', 0)
      this.setRes('safe', safe)
    } else {
      this.setRes('status', 1)
      await Util.sleep(3000)
    }
  }
}
SafeOperation.register('$OpenSafeById', () => { return new $OpenSafeById()})

/* Ouverture d'un Safe
  - accède au _safe_ dont l'id est `userId`.
  - accède dans la section `devices` à l'entrée `devId` 
  ce qui lui donne les propriétés `Va cy sign nbe`. 
*/
class $OpenSafeByPin extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const userId: string = this.args['userId']
    const devId: string = this.args['devId']
    const pincx: string = this.args['pincx']

    const [m, safe] = await this.db.getSafe(userId)
    if (!safe) {
      this.setRes('status', 2)
      return
    }
    if (!safe.devices) safe.devices = {}
    const dev = safe.devices[devId]
    if (!dev) {
      this.setRes('status', 3)
      return
    }
    /* vérifie par `Va` que `sign` est bien la signature de pincx 
    */
    const V = keyFromB64(dev.Va)
    // Rétablit la signature en EC - ce que ne fait pas la version PHP
    const s1 = Util.b64ToU8(dev.sign)
    const sign = Crypt.signFromAsn1(s1)
    const ok = await Crypt.verify(V, sign, Util.b64ToU8(pincx))
    this.cleanInvits(safe)
    if (!ok) {
      dev.nbe++
      if (dev.nbe > 2) {
        delete safe.devices[devId]
        this.setRes('status', 5)
      } else this.setRes('status', 4)
      if (Object.keys(safe.devices).length === 0)
        delete safe.devices
      await this.db.updSafe(safe)
      return
    }
    if (dev.nbe) {
      dev.nbe = 0
      await this.db.updSafe(safe)
    }
    this.setRes('status', 0)
    this.setRes('cy', dev.cy)
  }
}
SafeOperation.register('$OpenSafeByPin', () => { return new $OpenSafeByPin()})

type SetContact = {
  userId: string
  contact: string
  hct: string
  shk: string
}
/* Changement du contact
*/
class $SetContact extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const sc = this.args['setcontact'] as SetContact
    const safe = await this.getSafe(sc)
    if (!safe) return
    safe.contact = sc.contact
    safe.hct = sc.hct
    this.cleanInvits(safe)
    await this.db.updHctSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$SetContact', () => { return new $SetContact()})

type SetAdmins = {
  userId: string
  admins: string
  shk: string
}

class $SetAdmins extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const sa = this.args['setadmins'] as SetAdmins
    const safe = await this.getSafe(sa)
    if (!safe) return
    safe.admins = sa.admins
    this.cleanInvits(safe)
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$SetAdmins', () => { return new $SetAdmins()})

type TrustDev = {
  userId: string
  devId: string
  sh1p: Uint8Array
  sh1r: Uint8Array
  devName: Uint8Array
  Va: string
  cy: string
  sign: Uint8Array
  pseudo: string
}

type UntrustDev = {
  userId: string
  devIds: string[]
  sh1p: Uint8Array
  sh1r: Uint8Array
}

/* Trust d'un device
*/
class $TrustDevice extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['trustDev'] as TrustDev
    const safe = await this.getSafe(td)
    if (!safe) return

    safe.pseudo = td.pseudo || ''

    const d: Device = {
      devName: td.devName,
      Va: td.Va,
      cy: td.cy,
      sign: td.sign,
      nbe: 0
    }
    if (!safe.devices) safe.devices = {}
    safe.devices[td.devId] = d
    this.cleanInvits(safe)
    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$TrustDevice', () => { return new $TrustDevice()})

/* Trust d'un device
*/
class $UntrustDevices extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const td = this.args['untrustDev'] as UntrustDev
    const safe = await this.getSafe(td)
    if (!safe) return

    this.cleanInvits(safe)
    if (safe.devices) {
      for (const id of td.devIds)
        delete safe.devices[id]
      if (Object.keys(safe.devices).length === 0)
        delete safe.devices
    }
    await this.db.updSafe(safe)

    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UntrustDevices', () => { return new $UntrustDevices()})


/* Creds ***************************************************************/
type SetCred = {
  userId: string //
  shk: string // shaS de la clé K en base 64
  credid: string // id du credential
  comment: string // comment crypté par K et en base 64
  cred?: string // CredSafe sérialisé, crypté par K et en base64 (pour création)
}

class $CreateCred extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const sc = this.args['setCred'] as SetCred
    const safe = await this.getSafe(sc)
    if (!safe) return
    this.cleanInvits(safe)

    if (!safe.creds) safe.creds = {}
    const x = [sc.comment, sc.cred]
    safe.creds[sc.credid] = x

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$CreateCred', () => { return new $CreateCred()})

class $UpdateCredComment extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const sc = this.args['setCred'] as SetCred
    const safe = await this.getSafe(sc)
    if (!safe) return
    this.cleanInvits(safe)

    if (safe.creds) {
      const x = safe.creds[sc.credid]
      if (x) {
        x[0] = sc.comment
        safe.creds[sc.credid] = x
      }
    }

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdateCredComment', () => { return new $UpdateCredComment()})

type RevokeCreds = {
  userId: string
  shk: string
  ids: string[] 
}

class $AutoRevokeCreds extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const rc = this.args['revokeCreds'] as RevokeCreds
    const safe = await this.getSafe(rc)

    if (!safe) return
    this.cleanInvits(safe)

    if (safe.creds) {
      for(const id of rc.ids) delete safe.creds[id]
      if (Object.keys(safe.creds).length === 0)
        delete safe.creds
    }

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$AutoRevokeCreds', () => { return new $AutoRevokeCreds()})
/****************************************************************/

/* Profiles *****************************************************/
type SetProfiles = {
  app: string
  userId: string
  shk: string
  profiles: Object | null // clé: profId, valeur: Objet Profile sérialisé crypté
  delprofs: string[] // liste des profIds à supprimer
}
class $UpdateProfiles extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const sp = this.args['setProfiles'] as SetProfiles
    const safe = await this.getSafe(sp)
    if (!safe) return
    this.cleanInvits(safe)

    if (!safe.profiles) safe.profiles = {}

    let appp = safe.profiles[sp.app]
    if (!appp) { appp = {}; safe.profiles[sp.app] = appp }
    for(const profId in sp.profiles)
      appp[profId] = sp.profiles[profId]
    for(const profId of sp.delprofs)
      delete appp[profId]
    if (Object.keys(safe.profiles[sp.app]).length === 0)
      delete safe.profiles[sp.app]
    if (Object.keys(safe.profiles).length === 0)
      delete safe.profiles

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdateProfiles', () => { return new $UpdateProfiles()})

type SetAboutProfile = {
  app: string
  userId: string
  shk: Uint8Array
  profId: string
  about: Uint8Array
}
/* Maj de l'about d'un profil */
class $SetAboutProfile extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const ab = this.args['aboutProfile'] as SetAboutProfile
    const safe = await this.getSafe(ab)
    if (!safe) return
    this.cleanInvits(safe)

    if (safe.profiles && safe.profiles[ab.app] && safe.profiles[ab.app][ab.profId]) {
      const prf = decode(Util.b64ToU8(safe.profiles[ab.app][ab.profId]))
      prf['about'] = ab.about
      safe.profiles[ab.app][ab.profId] = Util.u8ToB64(encode(prf))
    }
    await this.db.updSafe(safe)

    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$SetAboutProfile', () => { return new $SetAboutProfile()})
/***********************************************************************/

/* Prefs ***************************************************************/
type UpdatePrefs = {
  app: string
  userId: string
  shk: string    
  prefs: Object // clé: crId, valeur: Objet Credential sérialisé crypté
  delprefs: string[] // liste des crIds à supprimer
}

class $UpdatePrefs extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const up = this.args['updatePrefs'] as UpdatePrefs
    const safe = await this.getSafe(up)
    if (!safe) return
    this.cleanInvits(safe)

    if (!safe.prefs) safe.prefs = {}

    let appp = safe.prefs[up.app]
    if (!appp) { appp = {}; safe.prefs[up.app] = appp }
    for(const code in up.prefs)
      appp[code] = up.prefs[code]
    for(const code of up.delprefs)
      delete appp[code]
    if (Object.keys(safe.prefs[up.app]).length === 0)
      delete safe.prefs[up.app]
    if (Object.keys(safe.prefs).length === 0)
      delete safe.prefs

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdatePrefs', () => { return new $UpdatePrefs()})
/*****************************************************************************/

type AddInvit = {
  userId: string // Attention: userId ou pseudo 1 2 ou contact
  invitId: string
  status: number
  time: number
  invit: string // Objet invit sérialisé crypté en base64
  shk?: string // Cas d'une création pour U par U
  pubC?: string // Cas d'une création pour U par X
                // invit est à décrypter par le couple U/X (et non keyK)
}

class $AddInvit extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const inv = this.args['addInvit'] as AddInvit
    const [m, safe] = await this.db.getSafe(inv.userId)
    if (!safe) {
      this.setRes('status', 1)
      return
    }
    if (inv.shk && safe.hhk !== Crypt.shaS(Util.b64ToU8(inv.shk))) {
      this.setRes('status', 2)
      return
    }

    if (!safe.invits) safe.invits = {}

    const x = { status: inv.status, time: inv.time, invit: inv.invit }
    if (inv.pubC) x['pubC'] = inv.pubC
    safe.invits[inv.invitId] = x
    this.cleanInvits(safe)

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    // le safe n'est pas retourné dans la cas d'une création par X
    if (inv.shk) this.setRes('safe', safe)
  }
}
SafeOperation.register('$AddInvit', () => { return new $AddInvit()})

export type StatusInvit = {
  targetId: string
  invitId: string
  status: number
}

class $StatusInvit extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const st = this.args['statusInvit'] as StatusInvit
    const [m, safe] = await this.db.getSafe(st.targetId)
    if (!safe || !safe.invits) {
      this.setRes('status', 1)
      return
    }

    const inv = safe.invits[st.invitId]
    if (inv) {
      inv.status = st.status
      this.cleanInvits(safe)
      await this.db.updSafe(safe)
      this.setRes('status', 0)
    } else this.setRes('status', 2)
  }
}
SafeOperation.register('$StatusInvit', () => { return new $StatusInvit()})

/*
type TransmitCred = {
  targetId: string // id ou p0 ou r0 du destinataire du credential
  credid: string // id du credential
  crpub: string // [cryptedCred, pubc] encodé et en base64
    // pubC: string // clé publique (PEM) de cryptage de l'émetteur
    // cryptedCred: string // Objet Credential sérialisé crypté pour le destinataire
}

class $TransmitCred extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const tc = this.args['transmitCred'] as TransmitCred
    const [m, safe] = await this.db.getSafe(tc.targetId)

    if (!safe) {
      this.setRes('status', 1)
      return
    }
    this.cleanInvits(safe)

    if (!safe.creds) safe.creds = {}

    safe.creds['$' + tc.credid] = tc.crpub
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
  }
}
SafeOperation.register('$TransmitCred', () => { return new $TransmitCred()})
*/


/* Status de création d'un safe - Permet de savoir dans quelles conditions le safe pourrait être "recréé".
- id, hp0, hr0 : id et accès externe 
Retour : { lm, xp, xr }
- lm : last modifidication time du safe d' id donnée. -1 si ce safe n'existe pas.
- xp : true si aucun safe n'a hp0 comme cl& externe OU si le safe d'id existe et a 
hp0 comme clé p0
- xr : idem pour hr0
*/
class $StatusSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const hp0 = this.args['hp0']
    const hr0 = this.args['hr0']
    const ret = await this.db.statusSafe(id, hp0, hr0)
    this.setRes('statusSafe', ret)
  }
}
SafeOperation.register('$StatusSafe', () => { return new $StatusSafe()})

/* Obtention des clés publiques d'un safe donné par:
- son id, son pseudo principal ou secondaire
- res.crypt: clé de cryptage
- res.verif: clé de vérification

class $GetPublicKeys extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const [m, safe] = await this.db.getSafe(id)
    this.setRes('userId', safe.id)
    this.setRes('crypt', safe ? safe.C : null)
    this.setRes('verify', safe ? safe.V : null)
  }
}
SafeOperation.register('$GetPublicKeys', () => { return new $GetPublicKeys()})
*/

/* Obtention des clés publiques et id d'un safe donné par:
- son id, son pseudo principal ou secondaire, son contact
*/
class $GetUserICVO extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const id = this.args['id']
    const [m, safe] = await this.db.getSafe(id)
    this.setRes('icvo', {i: safe.id, c: safe.C, v: safe.V, o: '' })
  }
}
SafeOperation.register('$GetUserICVO', () => { return new $GetUserICVO()})


/* Suppression d'un safe - auth "forte" requise */
class $DelSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const userId = this.args['userId']
    const safe = await this.getSafe(this.args)
    if (!safe) return
    await this.db.delSafe(userId)
    this.setRes('status', 0)
  }
}
SafeOperation.register('$DelSafe', () => { return new $DelSafe()})

/* Ping */
class $Ping extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    this.setRes('ping', true)
  }
}
SafeOperation.register('$Ping', () => { return new $Ping()})
