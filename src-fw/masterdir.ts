import { encode, decode } from '@msgpack/msgpack'

import { AppExc, AbstractOperation } from './index'
import { Crypt } from './crypt'
import { keyFromB64 } from './b64'
import { config, Registry } from './config'
import { MDTable, MDopn, MDuser, MDsetAA, MDsetS, MDdel, CaseRow } from './iDbGeneric'

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
class MDCache {
  /* Cache des couples [clé C, clé V] par UserId */
  static cvs : Map<string, [string, string]> = new Map()

  static svcops : Map<string, Dobj> = new Map()
  static orgs : Map<string, Dobj> = new Map()
  
  static maxLife = 3 * 60

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
        case MDTable.SVCOPS : { MDCache.svcops.set(id, e); break }
        case MDTable.ORGS : { MDCache.orgs.set(id, e); break }
      }
    }
    return e.val
  }

  /* Sauvegarde l'objet associé à la table SVCOPS / ORGS pour la table et l'ID spéciées.
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
    let u = await this.getUrl(svc, org)
    if (!u) return null
    if (!u.endsWith('/')) u += '/'
    const url = u + 'op/' + opName
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
  async getCV (userId: string) {
    let cv = MDCache.cvs.get(userId)
    if (!cv) {
      const mdUser = await this.db.mdUserGet(userId) as MDuser | null
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
      const cv = await this.getCV(userId)
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

/* $mdUserGetICVS : retourne l'ID et le store d'user cité par 
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
    const cv = await this.getCV(userId)
    if (cv) this.setRes('cv', cv)
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

export type CaseData = {
  chk: string // SHA raccourci des données immuables `caseId, userId topicId subject svc org`. Permet de vérifier que la demande vient bien d'un détenteur légitime (session ou opération).
  svc: string //
  org: string // service détenteur de l'ardoise.
  topicId: string // topic du _cas_.
  subject: string // sujet du cas si requis.
  status: number // 0 1 2 3
  aboutU: string // texte crypté de commentaire pour le seul usage de l'utilisateur.
  lv: number // dernière version _lue_ par U. La comparaison avec `v` permet de savoir si U a eu connaissance de la dernière évolution produite par le service.

  caseId?: string
  v?: number
}

/* `mdCaseNew`: _preset_ de création du case avec ses propriétés immuables.
  - arguments: `caseId userId topicId subject svc org`
*/
class $mdCaseNew extends MDOperation {
  async doTheJob () : Promise<void> { 
    const caseId = this.args['caseId'] as string
    const userId = this.args['userId'] as string
    const cd = this.args['caseData'] as CaseData
    cd.lv = 0
    cd.chk = Crypt.shaS([caseId, userId, cd.topicId, cd.subject, cd.svc, cd.org].join('/'))
    const cr: CaseRow = { caseId, userId, v: 0, data: encode(cd)}
    await this.db.mdCaseNew(cr)
  }
}
Registry.registerOp($mdCaseNew)

/* mdCaseSync: synchronise les propriétés variables `v status` avec les valeurs du _document_.
  - arguments: `caseId chk`
*/
class $mdCaseSync extends MDOperation {
  async doTheJob () : Promise<void> { 
    const caseId = this.args['caseId'] as string
    const chk = this.args['chk'] as string
    const cr = (await this.db.mdCaseGet(caseId)) as CaseRow
    if (cr) {
      const cd = decode(cr.data) as CaseData
      const chk2 = Crypt.shaS([caseId, cr.userId, cd.topicId, cd.subject, cd.svc, cd.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_case_chk', this)
      const ret = await this.postSvcOp(cd.svc, cd.org, 'CaseSync', { caseId } )
      const r:CaseInfo1 = ret ? ret.info : null
      if (r) {
        cr.v = r.v
        cd.status = r.status
        cr.data = encode(cd)
        await this.db.mdCaseSet(cr)
      }
    }
  }
}
Registry.registerOp($mdCaseSync)

/* mdCaseUser: fixe les propriétés variables `lv aboutU` avec les valeurs fixées par l'utilisateur.
  - arguments: `caseId chk lv aboutU`
*/
class $mdCaseUser extends MDOperation {
  async doTheJob () : Promise<void> { 
    const caseId = this.args['caseId'] as string
    const chk = this.args['chk'] as string
    const lv = this.args['lv'] as number
    const aboutU = this.args['aboutU'] as string
    const cr = (await this.db.mdCaseGet(caseId)) as CaseRow
    if (cr) {
      const cd = decode(cr.data) as CaseData
      const chk2 = Crypt.shaS([caseId, cr.userId, cd.topicId, cd.subject, cd.svc, cd.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_case_chk', this)
      cd.lv = lv
      cd.aboutU = aboutU
      cr.data = encode(cd)
      await this.db.mdCaseSet(cr)
    }
  }
}
Registry.registerOp($mdCaseUser)

/* mdCaseDel: suppression d'un case
  - arguments: `caseId chk`
*/
class $mdCaseDel extends MDOperation {
  async doTheJob () : Promise<void> { 
    const caseId = this.args['caseId'] as string
    const chk = this.args['chk'] as string
    const cr = (await this.db.mdCaseGet(caseId)) as CaseRow
    if (cr) {
      const cd = decode(cr.data) as CaseData
      const chk2 = Crypt.shaS([caseId, cr.userId, cd.topicId, cd.subject, cd.svc, cd.org].join('/'))
      if (chk2 !== chk) 
        throw new AppExc(105, 'masterdir_case_chk', this)
      await this.db.mdCaseDel(caseId)
    }
  }
}
Registry.registerOp($mdCaseDel)

/* Retourne la liste des cases d'un user donné
*/
class $mdCaseList extends MDOperation {
  async doTheJob () : Promise<void> { 
    const userId = this.args['userId'] as string
    const rows = await this.db.mdCaseList(userId) as CaseRow[]
    const lst = []
    for(const row of rows) {
      const cd = decode(row.data) as CaseData
      cd.v = row.v
      cd.caseId = row.caseId
      lst.push(cd)
    }
    this.setRes('caselist', lst)
  }
}
Registry.registerOp($mdCaseList)
