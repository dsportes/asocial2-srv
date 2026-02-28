import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
import { Crypt, fromPem } from './crypt'
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

/****************************************************** 
 * Pour le Safe GENERIQUE seulement 
*******************************************************/
type Dobj = {
  at: number,
  v: number,
  val: Object | [string, string]
}

class SafeCache {
  static pems : Map<string, Dobj> = new Map()
  static urls : Map<string, Dobj> = new Map()
  static orgs : Map<string, Dobj> = new Map()
  static maxLife = 3 * 60

  static async get(op: Operation, st: safeTable, id: string)
    : Promise<Object | [string, string]> {

    const now = Math.floor(Date.now() / 1000)
    let e: Dobj
    switch (st) {
      case safeTable.PEMS : { e = SafeCache.pems.get(id); break }
      case safeTable.URLS : { e = SafeCache.urls.get(id); break }
      case safeTable.ORGS : { e = SafeCache.orgs.get(id); break }
    }
    if (!e || e.at < now - SafeCache.maxLife) { // pas trouvé en cache ou trop vieux
      const x = await op.db.safeGet(st, id, 0)
      if (!x) {
        e = { at: now, v: 0, val: null}
      } else {
        let y = null
        try { y = JSON.parse(x[1]) } catch(e) {
          console.log(e)
        }
        e = { at: now, v: y ? x[0] : 0, val: y }
      }
      switch (st) {
        case safeTable.PEMS : { SafeCache.pems.set(id, e); break }
        case safeTable.URLS : { SafeCache.urls.set(id, e); break }
        case safeTable.ORGS : { SafeCache.orgs.set(id, e); break }
      }
    }
    return e.val
  }

  static async set(op: Operation, st: safeTable, id: string, val: Object | [string, string])
    : Promise<void> {

    const now = Math.floor(Date.now() / 1000)
    const e = { at: now, v: now, val }
    const value: string = JSON.stringify(val)
    await op.db.safeSet(st, id, now, value)
    switch (st) {
      case safeTable.PEMS : { SafeCache.pems.set(id, e); break }
      case safeTable.URLS : { SafeCache.urls.set(id, e); break }
      case safeTable.ORGS : { SafeCache.orgs.set(id, e); break }
    }    
  }

  static async del(op: Operation, st: safeTable, id: string)
    : Promise<void> {

    await op.db.safeDel(st, id)
    switch (st) {
      case safeTable.PEMS : { SafeCache.pems.delete(id); break }
      case safeTable.URLS : { SafeCache.urls.delete(id); break }
      case safeTable.ORGS : { SafeCache.orgs.delete(id); break }
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
    const now = Date.now()
    // if (time < now - 3000 || time > now + 3000) throw new AppExc(2003, 'no safe admin', this)
    if (config.MASTERDIRADMINUSERS.has(userId)) {
      const params = args['params']
      const sign = args['sign']
      const obj = await SafeCache.get(this, safeTable.PEMS, userId)
      const pemV = obj ? obj[1] : null
      if (pemV) {
        const ch = encode([time, params])
        try {
          const b = await Crypt.verify(fromPem(pemV, true), sign, ch)
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
- params: [SVC, $OP, url]
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])
*/
class $SetOpUrl extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const [SVC, $OP, url] = await this.getParams(this.args)
    let obj = await SafeCache.get(this, safeTable.URLS, SVC) as Object
    if (!obj) obj = { }
    let e = obj[$OP]
    if (!e) { e = { url: '', admins: [] }; obj[$OP] = e }
    e.url = url
    await SafeCache.set(this, safeTable.URLS, SVC, obj)
  }
}
SafeOperation.register('$SetOpUrl', () => { return new $SetOpUrl()})

/* Enregistre qu'une organisation est hébergée par l'opérateur $OP pour un service SVC
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
    let obj = await SafeCache.get(this, safeTable.URLS, SVC)
    if (!obj || !obj[$OP])
      throw new AppExc(2004, 'not hosted org', this, [SVC, $OP, org])
    obj = await SafeCache.get(this, safeTable.ORGS, org) as Object
    if (!obj) obj = { }
    obj[SVC] = $OP
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
*/
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

/* Déclare / révoque un administateur d'un service pour un opérateur. args: 
- userId
- params: [SVC, $OP, admin] - #abcd... pour révoquer abcd, abcd pour déclarer abcd
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])ADMINISTRATEUR du dépôt générique des Safes

class $SetOpAdmin extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const [SVC, $OP, admin] = await this.getParams(this.args, true)
    let obj = await SafeCache.get(this, safeTable.URLS, SVC) as Object
    if (!obj) obj = { }
    let e = obj[$OP]
    if (!e) { e = { url: '', admins: [] }; obj[$OP] = e }
    if (admin.startsWith('#')) {
      const a = admin.substring(1)
      const i = e.admins.indexOf(a)
      if (i !== -1) e.admins.splice(i, 1)
    } else {
      const i = e.admins.indexOf(admin)
      if (i !== -1) e.admins.push(admin)
    }
    await SafeCache.set(this, safeTable.URLS, SVC, obj)
  }
}
SafeOperation.register('$SetOpAdmin', () => { return new $SetOpAdmin()})
*/

/* Retourne les clés publiques de l'argument userId. Res:
- status: 0 si trouvé, 1 sinon
- pemC: PEM de cryptage
- pemV: PEM de vérification
*/
class $GetPubKeys extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const obj = await SafeCache.get(this, safeTable.PEMS, userId)
    const status = !obj || !obj[0] || !obj[1] ? 1 : 0 
    this.setRes('status', status )
    if (status === 0) {
      this.setRes('pemC', obj[0])
      this.setRes('pemV', obj[1])
    }
  }
}
SafeOperation.register('$GetPubKeys', () => { return new $GetPubKeys()})

/* Enregistre dans le dépôt générique des Safes les clés publiques 
d'un userId à sa création. Args: userId, pemC, pemV
Opération NON gardée: suppose de n'être invoquée QUE par 
l'opération de création d'un Safe.
*/
class $SetPubKeys extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const pemC = this.args['pemC'] as string
    const pemV = this.args['pemV'] as string
    await SafeCache.set(this, safeTable.PEMS, userId, [pemC, pemV])
  }
}
SafeOperation.register('$SetPubKeys', () => { return new $SetPubKeys()})

/* Retourne l'URL d'accès à un service SVC hébergé par un opérateur $OP
*/
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

/* Retourne couple [url, $OP] d'accès à un service SVC hébergeant une organisation org
- $OP est l'opértareur hébergeur de l'organisation pour ce service
*/
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

/***************************************************************
 * Opérations applicables aussi aux SafeStore "spécifiques"
 ***************************************************************/
export type SafeCodes = { // paramétres de l'opération $UpdCodesSafe
  id: string // identifiant aléatoire.
  pseudo: string // pseudo / trigramme crypté par la clé K du _safe_.
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
    safe.pseudo = safeNew.pseudo
    safe.hp0 = safeNew.hp0
    safe.hr0 = safeNew.hr0
    safe.hhp1 = safeNew.hhp1
    safe.hhr1 = safeNew.hhr1
    safe.Ka = safeNew.Ka
    safe.Kr = safeNew.Kr
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
    const V = fromPem(dev.Va, true)
    // Rétablit la signature en EC - ce que ne fait pas la version PHP
    const s1 = Util.b64ToU8(dev.sign)
    const sign = Crypt.signFromAsn1(s1)
    const ok = await Crypt.verify(V, sign, Util.b64ToU8(pincx))
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

type TrustDev = {
  userId: string
  devId: string
  sh1p: Uint8Array
  sh1r: Uint8Array
  devName: Uint8Array
  Va: string
  cy: string
  sign: Uint8Array
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

    const d: Device = {
      devName: td.devName,
      Va: td.Va,
      cy: td.cy,
      sign: td.sign,
      nbe: 0
    }
    if (!safe.devices) safe.devices = {}
    safe.devices[td.devId] = d
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
    const td = this.args['untrustDev']
    const safe = await this.getSafe(td)
    if (!safe) return

    if (safe.devices) {
      for (const id of td.devIds)
        delete safe.devices[id]
      if (Object.keys(safe.devices).length === 0)
        delete safe.devices
      await this.db.updSafe(safe)
    }
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$UntrustDevices', () => { return new $UntrustDevices()})

type SetAboutProfile = {
  app: string
  userId: string
  shk: Uint8Array
  profId: string
  about: Uint8Array
}

/* Sauvegarde de la maj de l'about du profil
ou crée un profil avec about et creds vide s'il n'existait pas */
class $SetAboutProfile extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const ab = this.args['aboutProfile'] as SetAboutProfile
    const safe = await this.getSafe(ab)
    if (!safe) return

    if (safe.profiles && safe.profiles[ab.app] && safe.profiles[ab.app][ab.profId]) {
      const prf = decode(Util.b64ToU8(safe.profiles[ab.app][ab.profId]))
      prf['about'] = ab.about
      safe.profiles[ab.app][ab.profId] = Util.u8ToB64(encode(prf))
      await this.db.updSafe(safe)
    }
    this.setRes('status', 0)
    this.setRes('safe', safe)
  }
}
SafeOperation.register('$SetAboutProfile', () => { return new $SetAboutProfile()})

type UpdateCreds = {
  app: string
  userId: string
  shk: Uint8Array
  creds: Object // clé: xid, valeur: Objet Credential sérialisé crypté
  delcreds: string[] // liste des xid à supprimer
  profiles: Object // clé: profId, valeur: Objet Profile sérialisé crypté
  delprofs: string[] // liste des profIds à supprimer
  nosafe: boolean // ne pas retourner le safe mis à jour
}

/* Mise à jour des credentials et profiles */
class $UpdateCreds extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const uc = this.args['updateCreds'] as UpdateCreds
    const safe = await this.getSafe(uc)
    if (!safe) return

    if (!safe.profiles) safe.profiles = {}
    if (!safe.creds) safe.creds = {}

    let appp = safe.profiles[uc.app]
    if (!appp) { appp = {}; safe.profiles[uc.app] = appp }
    for(const profId in uc.profiles)
      appp[profId] = uc.profiles[profId]
    for(const profId of uc.delprofs)
      delete appp[profId]
    if (Object.keys(safe.profiles[uc.app]).length === 0)
      delete safe.profiles[uc.app]
    if (Object.keys(safe.profiles).length === 0)
      delete safe.profiles

    for(const xid in uc.creds)
      safe.creds[xid] = uc.creds[xid]
    for(const xid of uc.delcreds)
      delete safe.creds[xid]
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
    if (!uc.nosafe) this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdateCreds', () => { return new $UpdateCreds()})

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

type TransmitCred = {
  targetId: string // id ou p0 ou r0 du destinataire du credential
  credXid: string // id du credential
  crpub: string // [cryptedCred, pubc] encodé et en base64
    // pubC: string // clé publique (PEM) de cryptage de l'émetteur
    // cryptedCred: string // Objet Credential sérialisé crypté pour le destinataire
}
/* Tranmission d'un credentialpar user "émetteur" à un user "target
- target est donné par son id ou l'un de ses pseudos p0 ou r0
- la clé publique de cryptage de l'émetteur est donnée dans pubC
- l'objet credential a été sérialisé puis crypté par la clé AES obtenue depuis
la clé privée de l'émetteur et la clé publique du destinataire target
*/
class $TransmitCred extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const tc = this.args['transmitCred'] as TransmitCred
    const [m, safe] = await this.db.getSafe(tc.targetId)

    if (!safe) {
      this.setRes('status', 1)
      return
    }

    if (!safe.creds) safe.creds = {}

    safe.creds['$' + tc.credXid] = tc.crpub
    if (Object.keys(safe.creds).length === 0)
      delete safe.creds

    await this.db.updSafe(safe)
    this.setRes('status', 0)
  }
}
SafeOperation.register('$TransmitCred', () => { return new $TransmitCred()})

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
*/
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

/* Suppression d'un safe - auth "forte" requise
*/
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