import { encode, decode } from '@msgpack/msgpack'

import { AppExc, AbstractOperation } from './index'
import { Crypt } from './crypt'
import { keyFromB64 } from './b64'
import { config, Registry } from './config'
import { MDTable, MDopn, MDuser, MDsetAA, MDsetS, MDdel, EventRow } from './iDbGeneric'
import { isJsxOpeningFragment } from 'typescript'

export function loadingOM () {
  console.log('masterdir operations loading: ', Registry.sizeOp())
}

export type CaseInfo1 = { 
  v: number // version du document. Elle détermine aussi la limite de validité du document.
  status: number // 0-annulé 1-actif-U 2-actif-H 3-finalisé.
}

type Dobj = {
  at: number, // date-heure de lecture
  v: number, // version: date-heure de dernière mise à jour
  val: Object // selon la table
  /* 
    orgs: Clé org => { svc1:OP1, svc2:OP2 ...}
    svcops: clé svc => { OP1:url1, OP2: url2 ...}
  */
}

/* Cache du MasterDir ************************************************/
export async function getSafeUrl (op: AbstractOperation, safeStore: string)
 : Promise<string> {
  const e: any = await MDCache.get(op, MDTable.SVCOPS, 'SAFE')
  // e.val { $STD:url1, $MYSF1: url2 ...}
  return !e.val ? '' : (e.val[safeStore] || '')
}

class MDCache {
  /* Cache des couples [clé C, clé V] par UserId */
  static cvs : Map<string, [string, string]> = new Map()

  static svcops : Map<string, Dobj> = new Map()
  static orgs : Map<string, Dobj> = new Map()
  
  static ttl = 3 * 60

  /* Retourne l'objet associé à la table SVCOPS / ORGS
  - soit trouvé en cache et d'age correct
  - soit (re)lu de la table et gardé en cache
  */
  static async get(op: AbstractOperation, st: MDTable, id: string) 
  : Promise<Object | null> {
    const now = Math.floor(Date.now() / 1000)
    let e: Dobj
    switch (st) {
      case MDTable.SVCOPS : { e = MDCache.svcops.get(id); break }
      case MDTable.ORGS : { e = MDCache.orgs.get(id); break }
    }
    if (!e || e.at < now - MDCache.ttl) { // pas trouvé en cache ou trop vieux
      const x = await op.db.mdGet(st, id, 0)
      if (!x) {
        e = { at: now, v: 0, val: null}
      } else {
        let y = null
        try { y = JSON.parse(x[1]) } catch(e) { console.log(e) }
        e = { at: now, v: y ? x[0] : 0, val: y }
      }
      switch (st) {
        case MDTable.SVCOPS : { MDCache.svcops.set(id, e); break }
        case MDTable.ORGS : { MDCache.orgs.set(id, e); break }
      }
    }
    return e.val
  }

  /* Sauvegarde l'objet associé à la table SVCOPS / ORGS pour la table et l'ID spécifiées.
  Si val est null, supprime l'entrée. 
  Toutefois en cache l'entrée existe toujours avec une val null pour évier une relecture
  en base en cas de redemande.
  */
  static async set(op: AbstractOperation, st: MDTable, id: string, val: Object)
    : Promise<void> {

    const now = Math.floor(Date.now() / 1000)
    const e = { at: now, v: now, val }
    if (val) {
      const value: string = JSON.stringify(val)
      await op.db.mdSet(st, id, now, value)
    } else await op.db.mdDel(st, id)
    switch (st) {
      case MDTable.SVCOPS : { MDCache.svcops.set(id, e); break }
      case MDTable.ORGS : { MDCache.orgs.set(id, e); break }
    }    
  }
}

/* Appel direct (pas par HTTP post) DEPUIS UNE OPERATION d'un service
  d'une opération sur MasterDir: 
  const result = await MDOperation.doOp(opName, args)
*/
export class MDOperation implements AbstractOperation {
  opName: string
  result: any
  args: any 
  db: any // accès à _Master Directory_
  now: number
  
  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }
  
  static async doOp (opName: string, args: Object) : Promise<Object> {
    const op = Registry.newOp(opName)
    if (!op) 
      throw new AppExc(103, 'masterdir_unknown_operation', null, [opName])
    op.opName = opName
    op.now = Date.now()
    op.args = args
    op.result = {}
    try {
      await config.masterDB.getConnexion(op, '')
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e: any) {
      await op.db.disconnect()
      throw (e)
    }
  }

  async getUrl (svc: string, org: string) : Promise<string> {
    const orgItem = await MDCache.get(this, MDTable.ORGS, org)
    if (!orgItem) return ''
    const oper = orgItem[svc]
    if (!oper) return ''
    const svcop = await MDCache.get(this, MDTable.SVCOPS, svc)
    if (!svcop) return ''
    const url = svcop[oper]
    return url || ''
  }

  /* Appel par HTTP d'une opération d'un service pour une organisation */
  async postSvcOp (svc: string, org: string, opName: string, args: any) 
    : Promise<any> {
    args.org = org
    args.opName = opName
    let u = await this.getUrl(svc, org)
    if (!u) return null
    if (!u.endsWith('/')) u += '/'
    const url = u + 'op/'
    const body = new Uint8Array(encode(args))
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',  // sent request
          'Accept':       'application/octet-stream'   // expected data sent back
        },
        body
      })
      const buf = await response.bytes()
      return response.status === 200 ? decode(buf) : null
    } catch (e: any) {
      console.log(e.toString())
      return null
    }
  }

  /* Méthode de convenance d'usage interne
  Accès NON transactionnel de consultation simple à l'instant t */
  static async getCV (op: AbstractOperation, userId: string) {
    let cv = MDCache.cvs.get(userId)
    if (!cv) {
      const mdUser = await op.db.mdUserGet(userId) as MDuser | null
      if (mdUser) {
        cv = [mdUser.C, mdUser.V]
        MDCache.cvs.set(userId, cv)
      }
    }
    return cv || null
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
    /* const now = Date.now()
      if (time < now - 3000 || time > now + 3000) 
        throw new AppExc(108, 'masterdir_challenge_too_old', this)
    */
    if (config.MASTERDIRADMINUSERS.has(userId)) {
      const params = args['params']
      const sign = args['sign']
      const cv = await MDOperation.getCV(this, userId)
      if (cv) {
        const ch = encode([time, params])
        try {
          const b = await Crypt.verify(keyFromB64(cv[1]), sign, ch)
          if (b) return params
        } catch (e) {
          console.log(e)
        }
      }
    }
    throw new AppExc(101, 'masterdir_no_admin', this)
  }
}

/* Opérations sur _Master Directory 'users' ***********************
Transactionnelles:
- $NewMDuser $SetMDuserAA $SetMDuserS $SetMDuserLLQ : mise à jour depuis un safe (shK fourni)
NON transactionnelles : jamais invoquée dans une transaction.
- $GetMDuserAAS : depuis un safe (shK founi).
- $GetMDuserICVS $GetMDuserCV: depuis une opération ou un safe
******************************************************************/

/* $mdNewUser : création d'une entrée dans 'users' pour un nouvel utilisateur.
S'il existe déjà avec le même contenu, OK.
Arguments: 
- mdUser: MDuser
Status: 10 11 12
*/
class $mdUserNew extends MDOperation {
  async doTheJob () : Promise<void> { 
    const mdUser = this.args['mdUser'] as MDuser
    const status = await this.db.mdUserSet(MDopn.new, mdUser)
    this.setRes('status', status)
  }
}
Registry.registerOp($mdUserNew)

/* $mdUserSetAA : change les alias d'un user.
OK et ne fais rien si déjà enregistré
Argument: 
- userId
- shK: Strong Hash de la clé K du safe
- sha1 : Strong Hash de l'alias 1 (bin)
- sha2 : Strong Hash de l'alias 2 (bin)
Result 'status':
- 0 OK
- 1 user inconnu
- 2 shK non reconnu
- 3 alias 1 déjà utilisé
- 4 alias 2 déjà utilisé
*/
class $mdUserSetAA extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId']
    const shK = this.args['shK']
    const hshK = Crypt.shaS(keyFromB64(shK))
    const sha1 = this.args['sha1']
    const hsha1 = Crypt.shaS(sha1)
    const sha2 = this.args['sha2']
    const hsha2 = sha2 ? Crypt.shaS(sha2) : ''
    const status = await this.db.mdUserSet(MDopn.setAA, {userId, hshK, hsha1, hsha2} as MDsetAA)
    this.setRes('status', status)
  }
}
Registry.registerOp($mdUserSetAA)

/* $mdUserSetS : change le store d'un user.
Argument: 
- userId
- shK: Strong Hash de la clé K du safe
- store : code du nouveau store gérant
Result 'status':
- 0 OK
- 1 user inconnu
- 2 shK non reconnu
*/
class $mdUserSetS extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId']
    const shK = this.args['shK']
    const hshK = Crypt.shaS(keyFromB64(shK))
    const store = this.args['store']
    const status = await this.db.mdUserSet(MDopn.setS, { userId, hshK, store } as MDsetS)
    this.setRes('status', status)
  }
}
Registry.registerOp($mdUserSetS)

/* $mdUserDel : supprime un user.
Argument: 
- userId
- shK: Strong Hash de la clé K du safe
Result 'status':
- 0 OK
- 1 user inconnu
- 2 shK non reconnu
*/
class $mdUserDel extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId']
    const shK = this.args['shK']
    const hshK = Crypt.shaS(keyFromB64(shK))
    const status = await this.db.mdUserSet(MDopn.del, { userId, hshK } as MDdel)
    this.setRes('status', status)
  }
}
Registry.registerOp($mdUserDel)

/* $mdUserGetAAS : retourne les propriétés dynamiques d'un user.
Appel depuis un safe.
Arguments:
- userId
- shk: Strong Hash de la clé K du safe
Result 'aas': [hsha1, hsha2, store]
- hsha1 : hash court du Strong Hash de l'alias 1
- hsha2 : hash court du Strong Hash de l'alias 2
- store: code de l'opérateur assurant la gestion du safe.
- absent si user inconnu ou erreur de shK
*/
class $mdUserGetAAS extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const shK = this.args['shK']
    const hshK = Crypt.shaS(keyFromB64(shK))
    const mdUser = await this.db.mdUserGet(userId, false) as MDuser | null
    if (mdUser && mdUser.hshK === hshK)
      this.setRes('aas', [mdUser.hsha1, mdUser.hsha2, mdUser.store])
  }
}
Registry.registerOp($mdUserGetAAS)

/* $mdUserGetICVS : retourne l'ID et le store d'un user cité par 
un alias ou son ID
Appel NON transactionnel (consultation simple à l'instant t).
Argument:
-userId: userId ou un alias de l'utilisateur
Result 'icvs' : { i:userId, c:C, v:V, c:store }
null si l'alias / userId ne correspond à aucune entrée
*/
class $mdUserGetICVS extends MDOperation {
  async doTheJob () : Promise<void> { 
    const alias = this.args['userId'] as string
    const mdUser = await this.db.mdUserGet(alias, true) as MDuser | null
    if (mdUser) 
      this.setRes('icvs', { i: mdUser.userId, c: mdUser.C, v: mdUser.V, s: mdUser.store })
  }
}
Registry.registerOp($mdUserGetICVS)

/* $mdUserGetCV : retourne les clés publiques d'un user connu par son ID
Argument:
- userId: userId de l'utilisateur
Result 'cv' : [c, v]
null si le userId ne correspond à aucune entrée
*/
class $mdUserGetCV extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const cv = await MDOperation.getCV(this, userId)
    if (cv) this.setRes('cv', cv || [null, null])
  }
}
Registry.registerOp($mdUserGetCV)

/* Test si un alias est libre 
- 'aliasfree' : true / false
*/
class $mdAliasFree extends MDOperation {
  async doTheJob () : Promise<void> { 
    const alias = this.args['alias'] as string
    this.setRes('aliasfree', await this.db.mdAliasFree(alias))
  }
}
Registry.registerOp($mdAliasFree)

/* Opérations d'administration sur SVCOPS et ORGS ****************
Les arguments sont signés.
*/
/* $SetOpUrl : déclare l'URL d'un service pour un opérateur. args: 
- userId: un ADMINISTRATEUR du _Master Directory_
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
Registry.registerOp($SetOpUrl)

/* $GrantSvcOpOrg : enregistre qu'une organisation est hébergée par l'opérateur $OP pour un service SVC
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
        throw new AppExc(101, 'masterdir_svc_unkown_or_not_implemented_by_op', this, [SVC, $OP, org])
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
Registry.registerOp($GrantSvcOpOrg)

/* Opérations de simple lecture des configuration des services / organisations
Pas de contrôle d'accès.
*****************************************************************************/
/* $GetSvcUrls: pour une liste de services, retrourne une map avec une entrée par service:
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
Registry.registerOp($GetSvcUrls)

/* $GetOrgSvcs: pour une organisation donnée, retrourne une map avec une entrée par service
donnant l'opérateur qui en assure l'hébergement.
*/
class $GetOrgSvcs extends MDOperation {
  async doTheJob () : Promise<void> { 
    const org = this.args['org'] as string
    const svcs = await MDCache.get(this, MDTable.ORGS, org)
    if (svcs) this.setRes('svcs', svcs)
  }
}
Registry.registerOp($GetOrgSvcs)

type MDEvent = {
  // Immuables
  eventId: string // (PK) identifiant universel de l’événement / processus (formId pour un Form).
  type: string // code du type d'événement / processus.
  userId: string // utilisateur cible (INDEX).
  svc: string // service concerné.
  org: string // organisation concernée.
  // Modifiables par les opérations seulement:
  v: number // version, date-heure (_epoch_) du _document_. 
  maxLife: number // time-to-live calculé depuis `v` et `type`. (INDEX pour purges périodiques).
  status: number // son statut courant.
  detail: Object // objet de structure dépendant de _type_.
  // Lisibles et modifiables par U seulement:
  comment: Uint8Array // commentaire de l'utilisateur cible crypté par lui.
  lv: number // last view, date-heure du dernier état _vu_ par U. La comparaison avec `v` permet de détecter ce qui a _changé_ depuis le dernier scan par U.
}

export type MDEventS = {
  v: number // version, date-heure (_epoch_) du _document_. 
  maxLife: number // time-to-live calculé depuis `v` et `type`. (INDEX pour purges périodiques).
  status: number // son statut courant.
  detail: Object // objet de structure dépendant de _type_.
  comment?: Uint8Array // commentaire de l'utilisateur cible crypté par lui.
  lv?: number // last view, date-heure du dernier état _vu_ par U. La comparaison avec `v` permet de détecter ce qui a _changé_ depuis le dernier scan par U.
}

export type MDEventU = {
  comment: Uint8Array // commentaire de l'utilisateur cible crypté par lui.
  lv: number // last view, date-heure du dernier état _vu_ par U. La comparaison avec `v` permet de détecter ce qui a _changé_ depuis le dernier scan par U.
}

/* Création d'un MDEvent qui vient d'être enregistré par le service
- eventId type svc org
- ch : challenge aléatoire prouve que l'appellant connaît l'event
- comment: crypté par la clé K du user
*/
class $mdEventNew extends MDOperation {
  async doTheJob () : Promise<void> { 
    const eventId = this.args['eventId'] as string
    const type = this.args['type'] as string
    const userId = this.args['userId'] as string
    const svc = this.args['svc'] as string
    const org = this.args['org'] as string
    const ch = this.args['ch'] as string
    const comment = this.args['comment'] as Uint8Array
    const ret = await this.postSvcOp(svc, org, 'MDEventFull', { eventId, type, ch } )
    const s:MDEventS = ret ? ret.mdsync : null
    if (s === null) return
    const e: MDEvent = {
      eventId, type, userId, svc, org,
      v: s.v, maxLife: s.maxLife, status: s.status, detail: s.detail, 
      comment: comment, 
      lv: s.status === 1 ? s.v : 0
    }
    const row = {
      eventId: e.eventId,
      userId: e.userId,
      v: e.v,
      maxLife: e.maxLife,
      data: encode(e)
    } as EventRow
    await this.db.mdEventNew(row)
  }
}
Registry.registerOp($mdEventNew)

/* mdEventSync: synchronise les propriétés variables
`v maxLife status detail` avec les valeurs du _document_.
- eventId
- chk: SHA raccourci de la sérialisation de `[eventId type userId svc org]`
*/
class $mdEventSync extends MDOperation {
  async doTheJob () : Promise<void> { 
    const eventId = this.args['eventId'] as string
    const chk = this.args['chk'] as string
    const data = (await this.db.mdEventGet(eventId)) as Uint8Array
    if (data) {
      const e = decode(data) as MDEvent
      const chk2 = Crypt.shaS([e.eventId, e.type, e.userId, e.svc, e.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_case_chk', this)
      const ret = await this.postSvcOp(e.svc, e.org, 'MDEventSync', { eventId, type: e.type, chk } )
      const s:MDEventS = ret ? ret.mdsync : null
      if (s) {
        e.v = s.v
        e.status = s.status
        e.maxLife = s.maxLife
        e.detail = s.detail
        await this.db.mdEventSet({
          eventId: e.eventId,
          userId: e.userId,
          v: e.v,
          maxLife: e.maxLife,
          data: encode(e)
        } as EventRow)
      }
    }
  }
}
Registry.registerOp($mdEventSync)

/* mdEventUser: synchronise les propriétés variables user:
- comment (crypté par U): si null, inchangé. Pour effacer envoyer Uint8Array[0]
- lv
- eventId
- chk: SHA raccourci de la sérialisation de `[eventId type userId svc org]`
*/
class $mdEventUser extends MDOperation {
  async doTheJob () : Promise<void> { 
    const eventId = this.args['eventId'] as string
    const setlv = this.args['setlv'] as boolean
    const comment = this.args['comment'] as Uint8Array | null
    const chk = this.args['chk'] as string
    const data = (await this.db.mdEventGet(eventId)) as Uint8Array
    if (data) {
      const e = decode(data) as MDEvent
      const chk2 = Crypt.shaS([e.eventId, e.type, e.userId, e.svc, e.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_case_chk', this)
      if (setlv) e.lv = e.v
      if (comment) e.comment = comment.length ? comment : null
      await this.db.mdEventSet({
        eventId: e.eventId,
        userId: e.userId,
        v: e.v,
        maxLife: e.maxLife,
        data: encode(e)
      } as EventRow)
    }
  }
}
Registry.registerOp($mdEventUser)

/* mdCaseDel: suppression d'un MDEvent
- eventId
- chk: SHA raccourci de la sérialisation de `[eventId type userId svc org]`
*/
class $mdEventDel extends MDOperation {
  async doTheJob () : Promise<void> { 
    const eventId = this.args['eventId'] as string
    const chk = this.args['chk'] as string
    const data = (await this.db.mdEventGet(eventId)) as Uint8Array
    if (data) {
      const e = decode(data) as MDEvent
      const chk2 = Crypt.shaS([e.eventId, e.type, e.userId, e.svc, e.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_event_chk', this)
      await this.db.mdEventDel(eventId)
    }
  }
}
Registry.registerOp($mdEventDel)

class $mdEventPurge extends MDOperation {
  async doTheJob () : Promise<void> { 
    const limit = this.args['limit'] as number
    await this.db.mdEventPurge(limit)
  }
}
Registry.registerOp($mdEventPurge)

/* Retourne la liste des MDEvent d'un user donné
*/
class $mdEventList extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const datas = await this.db.mdEventList(userId) as Uint8Array[]
    const lst = []
    const now = Date.now()
    for(const data of datas) {
      const e = decode(data) as MDEvent
      if (e.maxLife * 1000 > now) lst.push(e)
    }
    this.setRes('mdevents', lst)
  }
}
Registry.registerOp($mdEventList)

/*
### Table `ZZEVENTS` du _Master Directory_
CREATE TABLE IF NOT EXISTS "ZZEVENTS" (
  "eventId" TEXT,
  "userId" TEXT,
  "v" INTEGER,
  "maxLife" INTEGER,
  "data" BLOB,
PRIMARY KEY(eventId));
CREATE INDEX IF NOT EXISTS "ZZEVENTS_userId" ON "ZZEVENTS" ( "userId" );
CREATE INDEX IF NOT EXISTS "ZZEVENTS_v" ON "ZZEVENTS" ( "v" );
CREATE INDEX IF NOT EXISTS "ZZEVENTS_maxLife" ON "ZZEVENTS" ( "maxLife" ) WHERE "maxLife" > 0;
*/