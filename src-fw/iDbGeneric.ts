
import { AbstractOperation, DbConnector } from '../src-fw/index'

/* Interface des services d'accès génériques à la DB */

export enum MDopn { new, setAA, setS, del }

export type MDuser = {
  userId: string // ID de l'utilisateur`
  hshK: string // SHA raccourci du Strong Hash de la clé K
  hsha1: string // SHA raccourci du Strong Hash de l'alias 1 (s'il existe). En base 64.
  hsha2: string // SHA raccourci du Strong Hash de l'alias 2 (s'il existe). En base 64.
  C: string // clé publique de cryptage de U. En base 64.
  V: string // clé publique de vérification de U. En base 64.
  llq: number // _last quarter login_. Numéro du trimestre de dernier login, 0 étant le premier de l'an 2000.
  store: string // code du store où est stocké à l'instant actuel le _safe_ de U.
  invit?: string
}

export type MDsetAA = {
  userId: string
  hshK: string
  hsha1: string
  hsha2: string
}

export type MDsetS = {
  userId: string
  hshK: string
  store: string
}

export type MDdel = {
  userId: string
  hshK: string
}

export interface $DCData {
  v: number
  incr?: boolean
}

export interface $DocData extends $DCData{
  data?: Uint8Array
}

export interface $CollData extends $DCData{
  datas?: Uint8Array[]
  moved?: Uint8Array[]
  deleted?: [string, number][]
}

export enum filter { LT, LE, EQ, NE, GE, GT, IN, CONTAINS, CONTAINSANY }

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

export interface row {
  _org?: string
  pk: string // primary key (hash)
  v: number // version: time de la dernière opération de création / maj / suppression
  maxLife?: number // time de fin de vie programmée par l'application (EPOCH en MINUTES)
  deleted?: boolean
  data: Uint8Array, // null si DELETED
}

export function cloneRow (src: row) : row {
  // @ts-expect-error
  const r: row = { pk: src.pk, v: src.v }
  r.data = src.data ? new Uint8Array(src.data) : null
  if (src._org) r._org = src._org
  if (src.deleted) r.deleted = true
  if (src.maxLife) r.maxLife = src.maxLife
  return r
}

export interface rowDB extends row {
  org: string
  ttl: number // TTL pour purge automatique par la DB
}

export type srvStatus = {
  now?: number,
  st: number,
  at: number,
  txt: string
}

export type Alias = {
  a1K: string // alias 1 crypté par la clé K (en base 64).
  hsha1: string // SHA raccourci du Strong Hash de l'alias 1.
  a2K: string
  hsha2: string
}

export type Auth = {
  llq: number //_last login quarter_, trimestre du dernier login. Permet une _purge_ périodique des _safe_ obsolètes / fantômes.
  lm: number // _epoch_ en secondes de dernière mise à jour.
  C: string // clé de cryptage en clair (en base 64).
  D: string // clé de décryptage cryptée par la clé `K` (en base 64).
  S: string // clé de signature cryptée par la clé `K` (en base 64).
  V: string // clé de vérification en clair (en base 64).
  hshK: string // SHA raccourci du Strong Hash de la clé K.
  admins: string // liste des couples `SVC1.$OP1 / SVC2.$OP2 / ...` dont l'utilisateur a _déclaré_ être l'administrateur (cryptée par sa clé K et en base 64). La véracité de la _déclaration_ est vérifiée mais l'utilisateur peut se voir retiré cette qualité par l'opérateur sans que cette liste ne change.
  pseudo: string // dernier pseudo crypté par la clé K du _safe_ (en base 64) utilisé à la certification d'un terminal.

  hshp1: string // SHA raccourci du Strong Hash de la phrase 1 (en base 64).
  K1: string // clé K cryptée par le Strong Hash de la phrase 1.
  hshp2: string
  K2: string

  actual: Alias
  future: Alias | null
}

export type Safe = {
  userId: string
  auth: Auth
  devices: Object | null
  creds: Object | null
  options: Object | null
  prefs: Object | null // pour chaque application, liste des préférences déclarées (ordonnée par date d'utilisation)
}

export type EventRow = {
  eventId: string
  userId: string
  v: number
  maxLife: number
  data: Uint8Array
}

export interface IDbGeneric {
  connector: DbConnector
  op: AbstractOperation
  key: Buffer
  org: string

  /* Connexion à la DB */
  connect () : Promise<void>

  /* Déconnexion de la DB */
  disconnect () : Promise<void>

  /* Master Directory ************************************************/

  mdGetValue (key: string, v: number) : Promise<[number, string]> 
  mdSetValue (key: string, v: number, value: string) : Promise<void> 

  /* ACID - Création / maj d'une entrée du Mester Directory
  - opn: code opération. new setAA setS setLLQ del
  - args: arguments - MDuser MDsetAA MDsetS MDsetLLQ MDdel
  Return : status
  */
  mdUserSet (opn: MDopn, args: MDuser | MDsetAA | MDsetS | MDdel ) : Promise<number>

  /* NON ACID - Test si un alias est attribué */
  mdAliasFree (alias: string) : Promise<boolean>

  /* NON ACID - consultation simple 
  MAIS met à jour llq si nécessaire (sans transaction).
  */
  mdUserGet(userId: string, alias?: boolean) : Promise<MDuser | null>

  getSingleton (key: string) : Promise<string>
  setSingleton (key: string, value: string) : Promise<void>

  mdEventNew (row: EventRow ) : Promise<void>
  mdEventGet (eventId: string ) : Promise<Uint8Array>
  mdEventSet (row: EventRow ) : Promise<void>
  mdEventDel (eventId: string ) : Promise<void>
  mdEventList (userId: string) : Promise<Uint8Array[]>
  mdEventPurge (limit: number ) : Promise<void>
  
  /* safe *****************************************************************************/
  /* Retourne le binaire du safe (décrypté, pas désencodé) */
  getBinSafe (userId: string) : Promise<Uint8Array | null>

  /* Status de création d'un safe - Permet de savoir dans quelles conditions le safe pourrait être "recréé".
  - id, hp0, hr0 : id et accès externe 
  Retour : { lm, xp, xr }
  - lm : last modifidication time du safe d' id donnée. -1 si ce safe n'existe pas.
  - xp : true si aucun safe n'a hp0 comme cl& externe OU si le safe d'id existe et a 
  hp0 comme clé p0
  - xr : idem pour hr0
  statusSafe (id: string, hp0: string, hr0: string) : Promise<Object>
  */

  /* Créé un nouveau safe. Insertion brute */
  newSafe (safe: Safe) :  Promise<void>
  // restoreSafe (safe: Safe) :  Promise<number>

  /* Met à jour un safe depuis son objet */
  updSafe (safe: Safe) :  Promise<void>

  /* Supprime un safe depuis son id */
  delSafe (userId: string) :  Promise<void>

  /* Purge les safes obsolètes */
  purgeSafes (lam: number) :  Promise<void>

  /* Exécute dans une transaction la méthode async transac() de l'opération.
  Retour 'normaux':
  - [hbc >= 0, ''] : OK - hbc : heart beat count
  - [-1, s] : s: libellé de l'exception "Saturation DB" de la base de donnée
  - [-2, s] : s: libellé d'une autre exception de la base de donnée
  Les autres exceptions ne sont pas trappées et sortent en exception (pas en retour 'normal')
  */
  doTransaction () : Promise<[number, string]> 

  bug () : Promise<void>

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
  - colName: nom de la propriété de sous-collection -'auteurs' 
  - pk, v, col (valeur de la propriété: 'Zola')
  Path: Org/demo/Article@auteurs/a5@Hugo
  row DB: { v, col, ttl }
  */
  writeRowQ (clazz: string, colName: string, pk: string, v: number, col: string) : void

  /* Retourne tous les rows de la classe indiquée:
  - si v = 0: tous ceux existant réellement à l'instant t.
  - sinon: ceux mis à jour ou supprimés postérieueremt à v.
  */
  allRowsData (clazz: string, v: number) : Promise<$CollData>

  /* Retourne le row de classe fixée ayant la pk fixée:
  - si v absent: ne retourne pas le row s'il est supprimé
  - si v présent ne retourne le row QUE s'il a été mis à jour ou supprimé après v.
    si supprimé , le data l'indique.
  */
  oneRow (clazz: string, pk: string, v: number) : Promise<row | null>

  /* Retourne le row de classe fixée dont la propriété "alias"
  a la valeur fixée par "value".
  "alias" doit avoir été cité comme index de type propType.STRING
  */
  oneRowByAlias (clazz: string, alias: string, value: string) : Promise<row | null>

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
    : Promise<$CollData>

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