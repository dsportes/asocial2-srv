import { encode, decode } from '@msgpack/msgpack'

import { AppExc, AbstractOperation } from './index'
import { Crypt, keyFromB64 } from './crypt'
import { config, Classes } from './config'
import { MDTable } from './iDbGeneric'

export function loadingOM () {
  console.log('masterdir operations loading: ', Classes.sizeOp())
}

export type ICVO = { // Clé: userId
  i: string // userId
  c: string // clé publique C de cryptage en base64
  v: string // clé publique V de vérification en base64
  o: string // code de l'opérateur hébergeant son safe
}

type Dobj = {
  at: number, // date-heure de lecture
  v: number, // version: date-heure de dernière mise à jour
  val: ICVO | Object // selon la table
  /* 
    users => ICVO
    orgs: Clé org => { svc1:OP1, svc2:OP2 ...}
    svcops: clé svc => { OP1:url1, OP2: url2 ...}
  */
}

/* Cache du MasterDir ************************************************/
class MDCache {
  static users : Map<string, Dobj> = new Map()
  static svcops : Map<string, Dobj> = new Map()
  static orgs : Map<string, Dobj> = new Map()
  static maxLife = 3 * 60

  /* Retourne l'objet associé à la table USERS / SVCOPS / ORGS
  - soit trouvé en cache et d'age correct
  - soit (re)lu de la table et gardé en cache
  */
  static async get(op: AbstractOperation, st: MDTable, id: string) 
  : Promise<Object | ICVO | null> {
    const now = Math.floor(Date.now() / 1000)
    let e: Dobj
    switch (st) {
      case MDTable.USERS : { e = MDCache.users.get(id); break }
      case MDTable.SVCOPS : { e = MDCache.svcops.get(id); break }
      case MDTable.ORGS : { e = MDCache.orgs.get(id); break }
    }
    if (!e || e.at < now - MDCache.maxLife) { // pas trouvé en cache ou trop vieux
      const x = await op.db.mdGet(st, id, 0)
      if (!x) {
        e = { at: now, v: 0, val: null}
      } else {
        let y = null
        try { y = JSON.parse(x[1]) } catch(e) { console.log(e) }
        e = { at: now, v: y ? x[0] : 0, val: y }
      }
      switch (st) {
        case MDTable.USERS : { MDCache.users.set(id, e); break }
        case MDTable.SVCOPS : { MDCache.svcops.set(id, e); break }
        case MDTable.ORGS : { MDCache.orgs.set(id, e); break }
      }
    }
    return e.val
  }

  /* Sauvegarde l'objet associé à la table USERS / SVCOPS / ORGS pour la table et l'ID spéciées.
  Si val est null, supprime l'entrée. 
  Toutefois en cache l'entrée existe toujours avec une val null pour évier une relecture
  en base en cas de redemande.
  */
  static async set(op: AbstractOperation, st: MDTable, id: string, val: Object | ICVO)
    : Promise<void> {

    const now = Math.floor(Date.now() / 1000)
    const e = { at: now, v: now, val }
    if (val) {
      const value: string = JSON.stringify(val)
      await op.db.mdSet(st, id, now, value)
    } else await op.db.mdDel(st, id)
    switch (st) {
      case MDTable.USERS : { MDCache.users.set(id, e); break }
      case MDTable.SVCOPS : { MDCache.svcops.set(id, e); break }
      case MDTable.ORGS : { MDCache.orgs.set(id, e); break }
    }    
  }
}

/* Appel direct DEPUIS UNE OPERATION d'une opération sur MasterDir 
  const result = await MDOperation.doOp(opName, args)
*/
export class MDOperation implements AbstractOperation {
  opName: string
  result: any
  args: any 
  db: any
  now: number
  
  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }
  
  static async doOp (opName: string, args: Object) : Promise<Object> {
    const op = Classes.newOp(opName)
    if (!op) 
      throw new AppExc(1002, 'unknown operation', null, [opName])
    op.opName = opName
    op.now = Date.now()
    op.args = args
    op.result = {}
    try {
      await config.masterDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e: any) {
      await op.db.disconnect()
      throw(e)
    }
  }

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
      const obj = await MDCache.get(this, MDTable.USERS, userId) as ICVO
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

/* Obtient le icvo d'un userId depuis le MASTERDIR
*/
class $GetUserICVO extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const icvo = await MDCache.get(this, MDTable.USERS, userId)
    this.setRes('icvo', icvo)
  }
}
Classes.registerOp($GetUserICVO)

/* Enregistre dans le MasterDir 
les clés publiques et l'opérateur gérant le safe d'un userId 
à sa création et quand il change d'opérateur de Safe store.
Args: userId, { i, c, v, o }
*/
class $SetUserICVO extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const icvo = this.args['icvo'] as ICVO
    await MDCache.set(this, MDTable.USERS, userId, icvo)
  }
}
Classes.registerOp($SetUserICVO)

/* Déclare l'URL d'un service pour un opérateur. args: 
- userId: un ADMINISTRATEUR du StoreSafe générique
- params: [SVC, $OP, url] - url vide, supprime l'entrée
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])
*/
class $SetOpUrl extends MDOperation {
  async doTheJob () : Promise<void> { 
    const [SVC, $OP, url] = await this.getParams(this.args)
    let obj = await MDCache.get(this, MDTable.SVCOPS, SVC) as Object
    if (obj) {
      if (url) obj[$OP] = url
      else {
        delete obj[$OP]
        if (Array.from(Object.entries(obj)).length === 0) obj = null
      }
    } else {
      if (url) { obj = { }; obj[$OP] = url }
    }
    await MDCache.set(this, MDTable.SVCOPS, SVC, obj)
  }
}
Classes.registerOp($SetOpUrl)

/* Enregistre qu'une organisation est hébergée par l'opérateur $OP pour un service SVC
Si $OP est null, l'organisation est révoquée pour ce service.
args:
- userId: un ADMINISTRATEUR du StoreSafe générique
- params: [SVC, $OP, org]
- time: date-heure de la requête
- sign: signature par la clé S de userId de encode([time, params])
*/
class $GrantSvcOpOrg extends MDOperation {
  async doTheJob () : Promise<void> { 
    const [SVC, $OP, org] = await this.getParams(this.args)
    if (SVC) { // Contrôle de l'existence de SVC et de son hébergement par OP
      const obj = await MDCache.get(this, MDTable.SVCOPS, SVC)
      if (!obj || !obj[$OP])
        throw new AppExc(2004, 'svc unkown or not implemented by $OP', this, [SVC, $OP, org])
    }
    let obj = await MDCache.get(this, MDTable.ORGS, org) as Object
    if (obj) {
      if ($OP) obj[SVC] = $OP
      else {
        delete obj[SVC]
        if (Array.from(Object.entries(obj)).length === 0) obj = null
      }
    } else {
      if ($OP) { obj = { }; obj[SVC] = $OP }
    }
    await MDCache.set(this, MDTable.ORGS, org, obj)
  }
}
Classes.registerOp($GrantSvcOpOrg)

/* Pour une liste de services, retrourne une map avec une entrée par service:
Cette entrée est une map donnant par opérateur, son URL
*/
class $GetSvcUrls extends MDOperation {

  async doTheJob () : Promise<void> { 
    const l = this.args['lsvc'] as string[]
    const urls = {}
    for(const svc of l) {
      const obj = await MDCache.get(this, MDTable.SVCOPS, svc)
      if (obj) urls[svc] = obj
    }
    this.setRes('urls', urls)
  }
}
Classes.registerOp($GetSvcUrls)

/* Pour une organisation donnée, retrourne une map avec une entrée par service
donnant l'opérateur qui en assure l'hébergement.
*/
class $GetOrgSvcs extends MDOperation {

  async doTheJob () : Promise<void> { 
    const org = this.args['org'] as string
    const svcs = await MDCache.get(this, MDTable.ORGS, org)
    if (svcs) this.setRes('svcs', svcs)
  }
}
Classes.registerOp($GetOrgSvcs)
