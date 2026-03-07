import { DbConnector } from './dbConnector'
import { Operation } from './operation'

/* Interface des services d'accès génériques à la DB */
export enum safeTable { 
  PEMS = 'SAFEPEMS',
  URLS = 'SAFEURLS',
  ORGS = 'SAFEORGS'
}

export enum filter { LT, LE, EQ, NE, GE, GT, CONTAINS, CONTAINSANY }

export enum updType { SET, CREATE, UPDATE }

export const zombiLapse = 90 * 86400 // 90 jours en secondes 

export const safeLapse = 750 * 86400 // 750 jours en secondes 

export type pkv = [ pk: string, v: number ]

export type expList = {
  rows: row[],
  eox: boolean, // true si l'export est terminé (plus de documents à exporter)
  lastMark: string // dernière pk exportée
}

export type expListQ = {
  rows: rowQ[],
  eox: boolean, // true si l'export est terminé (plus de documents à exporter)
  lastMark: string // dernière pk exportée
}

export type rowQ = {
  pk?: string,
  ttl?: any, // DB seulement - TTL pour purge automatique par la DB
  v: number,
  col: string
}

export type vdata = {
  v : number,
  data: Uint8Array
}

export type row = {
  pk: string, // primary key (hash)
  v: number, // version: time de la dernière opération de création / maj / suppression
  maxLife?: number, // time de fin de vie programmée par l'application (EPOCH en MINUTES)
  ttl?: any, // DB seulement - TTL pour purge automatique par la DB
  data: Uint8Array, // null si DELETED
  dataORIG?: Uint8Array, // data AVANT encryption pour DB
  [index: string]:any
}

export type srvStatus = {
  now?: number,
  st: number,
  at: number,
  txt: string
}

export type Safe = {
  id: string // identifiant.

  lam: number // dernier mois d'accès
  lm: number // date-heure de dernière mise à jour

  pseudo: string // pseudo / trigramme crypté par la clé K du _safe_.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA court de `SH(p1)`.
  hhr1: string // SHA court de `SH(r1)`.
  Ka: string // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: string //  clé `K` du safe cryptée par `SH(r0, r1)`.
  
  hhk: string // SHA court de `SH(K)`.
  C : string // clé publique de cryptage,
  DK: string // clé privée de decryptage cryptée par la clé K
  V : string // clé publique de vérification,
  SK: string // clé privée de signature cryptée par la clé K
  contact: string // b64 du pseudo de contact temporaire crypté pa K
  hct: string // SH du contact
  admins: string // b64 du cryptage de la liste des couples SVC.$OP dont l'utilisateur est admin

  devices: Object
  creds: Object
  profiles: Object
  prefs: Object
}

export interface IDbGeneric {
  connector: DbConnector
  op: Operation
  key: Buffer
  org: string

  /* Connexion à la DB */
  connect () : Promise<void>

  /* Déconnexion de la DB */
  disconnect () : Promise<void>

  getSingleton (key: string) : Promise<string>
  setSingleton (key: string, value: string) : Promise<void>

  safeGet (st: safeTable, key: string, v: number) : Promise<[number, string]> 
  safeSet (st: safeTable, key: string, v: number, value: string) : Promise<void> 
  safeDel (st: safeTable, key: string) : Promise<void> 

  /* Retourne [r, safe]. safe est l'objet safe depuis,
  - soit son id (r=0)
  - soit son p0 (r=1)
  - soit son r0 (r=1)
  safe est null si non trouvé
  */
  getSafe (id: string) : Promise<[number, Safe]>
  getBinSafe (id: string) : Promise<[number, Uint8Array]>

  /* Status de création d'un safe - Permet de savoir dans quelles conditions le safe pourrait être "recréé".
  - id, hp0, hr0 : id et accès externe 
  Retour : { lm, xp, xr }
  - lm : last modifidication time du safe d' id donnée. -1 si ce safe n'existe pas.
  - xp : true si aucun safe n'a hp0 comme cl& externe OU si le safe d'id existe et a 
  hp0 comme clé p0
  - xr : idem pour hr0
  */
  statusSafe (id: string, hp0: string, hr0: string) : Promise<Object>

  /* Créé un nouveau safe. 
  Si le safe existait déjà avec cet id et qu'aucun autre d'id différente
  existait pour p0 / r0, il est RECREE (en fait mis à jour / écrasé)
  Retour:
  0: OK
  1: un safe d'id différent existe avec ce p0
  2: un safe d'id différent existe avec ce r0
  */
  newSafe (safe: Safe) :  Promise<number>
  restoreSafe (safe: Safe) :  Promise<number>

  /* Met à jour le p0 / ro d'un safe. Retour:
  0: OK
  1: un (autre) safe existe déjà avec ce p0
  2: un (autre) safe existe déjà avec ce r0
  */
  updPRSafe (safe: Safe) :  Promise<number>

  /* Met à jour le "contact" d'un safe
  0: OK
  1: un (autre) safe existe déjà avec ce contact
  */
  updHctSafe (safe: Safe) :  Promise<number>

  /* Met à jour un safe depuis son objet */
  updSafe (safe: Safe) :  Promise<void>

  /* Supprime un safe depuis son id */
  delSafe (id: string) :  Promise<void>

  /* Purge les safes obsolètes */
  purgeSafes (lam: number) :  Promise<void>

  /* Exécute dans une transaction la méthode async transac() de l'opération.
  Retour 'normaux':
  - [0, ''] : OK
  - [1, s] : s: libellé de l'exception "Saturation DB" de la base de donnée
  - [2, s] : s: libellé d'une autre exception de la base de donnée
  Les autres exceptions ne sont pas trappées et sortent en exception (pas en retour 'normal')
  */
  doTransaction () : Promise<[number, string]> 

  commit () : Promise<void>

  /* Exportation des rows n'ayant pas dépassé leur TTL
  mark: dont les pk sont > pk
  limit: nombre max de rows lus
  Retourne:
    rows : la liste des rows
    eox: true si le nombre de rows exportés n'a pas atteint la limite
    lastMark: dernière pk lue
  ATTENTION !!! mark ne doit pas être '' (mettre '0' pour commencer)
  */
  exportRows (clazz: string, mark: string, limit: number) : Promise<expList>

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  purgeRows (clazz: string, limit: number) : Promise<boolean>

  /* Import (insert / création) les rows
  */
  importRows (clazz: string, rows: row[]) : Promise<void>

  /* Exportation des rows n'ayant pas dépassé leur TTL
  mark: dont les id sont > mark
  limit: nombre max de rows lus
  Retourne:
    rows : la liste des rows
    eox: true si le nombre de rows exportés n'a pas atteint la limite
    mark: dernière pk@col lue
  */
  exportRowsQ (clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ>

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  purgeRowsQ (clazz: string, colName: string, limit: number) : Promise<boolean>

  /* Import (insert / création) les rowQ
  */
  importRowsQ (clazz: string, colName: string, rows: rowQ[]) : Promise<void>

  /* Inscrit (SET CREATE UPDATE) un row:
  - clazz: classe du document - 'Article'
  - org: code l'organisation - 'demo'
  - row: row
  */
  writeRow (ut: updType, clazz: string, row: row) : void

  /* Supprime (réellement) un document 
  */
  deleteRow (clazz: string, pk: string) : void

  /* Inscrit le rowQ déclarant que le document clazz/pk ne fait plus
  partie de la collection clazz/col à partir de v.
  - clazz: classe du document - 'Article'
  - org: code l'organisation - 'demo'
  - colName: nom de la propriété de sous-collection 
  - row APP: { v, col, pk }
  Path: Org/demo/Article@auteurs/a5@Hugo
  row DB: { v, col, ttl }
  */
  writeRowQ (clazz: string, colName: string, row: rowQ) : void

  /* Retourne tous les rows de la classe indiquée:
  - si v = 0: tous ceux existant réellement à l'instant t.
  - sinon: ceux mis à jour ou supprimés postérieueremt à v.
  */
  allRowsData (clazz: string, v: number) : Promise<Uint8Array[]>

  /* Retourne le row de classe fixée ayant la pk fixée:
  - si v absent: ne retourne pas le row s'il est supprimé
  - si v présent ne retourne le row QUE s'il a été mis à jour ou supprimé après v.
    si supprimé , le data l'indique.
  */
  oneRow (clazz: string, pk: string, v: number) : Promise<row | null>

  /* Retourne la sous-collection 'clazz/colName/colValue' des documents 
  (par exemple: Article/auteurs/Zola)
  - si vs est absent: connue actuellement (à now)
  - sinon documents ajoutés ou partis de la sous-collection (ou zombifiés) 
    depuis la version vs de la sous-collection connue en session.
  Retour: liste des documents (leur version la plus récente). 
  - Certains d'entre eux peuvent ne plus appartenir à la collection 
  (à vérifier en session) ou être zombi.
  */
  getColl(clazz: string, colName: string, col: string, isList: boolean, vs: number) 
    : Promise<Uint8Array[]>


  /* Sélectionne les documents et les transmet à la fonction de traitement
  Par organisation.
  fn reçoit en arguments (data) : data du row décrypté MAIS sérialisé
  */
  selectDocs(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void>
  
  /* Sélectionne les documents et les transmet à la fonction de traitement
  Toutes organisations confondues: RESERVE aux opérations d'ADMINISTRATION
  fn reçoit en arguments (org, data) : data du row décrypté MAIS sérialisé
  */
  selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void>

}