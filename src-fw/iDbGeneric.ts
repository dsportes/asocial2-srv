import { DbConnector } from './dbConnector'
import { Operation } from './operation'

/* Interface des services d'accès génériques à la DB */

export enum filter { LT, LE, EQ, NE, GE, GT, CONTAINS, CONTAINSANY }

export enum updType { SET, CREATE, UPDATE }

export const zombiLapse = 90 * 86400 // 90 jours en secondes 

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

export type row = {
  pk: string, // primary key (hash)
  v: number, // version: time de la dernière opération de création / maj / suppression
  maxLife?: number, // time de fin de vie programmée par l'application (précision en minutes)
  ttl?: any, // DB seulement - TTL pour purge automatique par la DB
  deleted?: boolean, // APP seulement - document supprimé
  data: Uint8Array,
  [index: string]:any
}

export interface IDbGeneric {
  connector: DbConnector
  op: Operation
  key: Buffer

  /* Connexion à la DB */
  connect () : Promise<void>

  /* Déconnexion de la DB */
  disconnect () : Promise<void>

  /* Inscription d'une trace dans le singleton Hdr/ping 
  Retour 'normaux':
  - [0, m] : ping OK. m message inscrit dans DB
  - [1, s] : s: libellé de l'exception "Saturation DB" de la base de donnée
  - [2, s] : s: libellé d'une autre exception de la base de donnée
  Les autres exceptions ne sont pas trappées et sortent en exception (pas en retour 'normal')
  */
  ping () : Promise<[number, string]> 

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
  exportRows (org: string, clazz: string, mark: string, limit: number) : Promise<expList>

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  purgeRows (org: string, clazz: string, limit: number) : Promise<boolean>

  /* Import (insert / création) les rows
  */
  importRows (org: string, clazz: string, rows: row[]) : Promise<void>

  /* Exportation des rows n'ayant pas dépassé leur TTL
  mark: dont les id sont > mark
  limit: nombre max de rows lus
  Retourne:
    rows : la liste des rows
    eox: true si le nombre de rows exportés n'a pas atteint la limite
    mark: dernière pk@col lue
  */
  exportRowsQ (org: string, clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ>

    /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  purgeRowsQ (org: string, clazz: string, colName: string, limit: number) : Promise<boolean>

  /* Import (insert / création) les rowQ
  */
  importRowsQ (org: string, clazz: string, colName: string, rows: rowQ[]) : Promise<void>

  /* Inscrit (SET CREATE UPDATE) un row:
  - clazz: classe du document - 'Article'
  - org: code l'organisation - 'demo'
  - row: row
  */
  writeRow (ut: updType, org: string, clazz: string, row: row) : Promise<void> 

  /* Supprime (réellement) un document 
  */
  deleteDoc (org: string, clazz: string, pk: string) : Promise<void>

  /* Inscrit le rowQ déclarant que le document clazz/pk ne fait plus
  partie de la collection clazz/col à partir de v.
  - clazz: classe du document - 'Article'
  - org: code l'organisation - 'demo'
  - colName: nom de la propriété de sous-collection 
  - row APP: { v, col, pk }
  Path: Org/demo/Article@auteurs/a5@Hugo
  row DB: { v, col, ttl }
  */
  writeRowQ (org: string, clazz: string, colName: string, row: rowQ) : Promise<void>

  /* Retourne tous les rows de la classe indiquée:
  - si v = 0: tous ceux existant réellement à l'instant t.
  - sinon: ceux mis à jour ou supprimés postérieueremt à v.
  */
  allRows (org: string, clazz: string, v: number) : Promise<Object[]>

  /* Retourne le row de classe fixée ayant la pk fixée:
  - si v absent: ne retourne pas le row s'il est supprimé
  - si v présent ne retourne le row QUE s'il a été mis à jour ou supprimé après v.
    si supprimé , le data l'indique.
  */
  oneRow (org: string, clazz: string, pk: string, v: number) : Promise<row | null>

    /* Retourne la sous-collection 'clazz/colName/col' (par exemple: Article/auteurs/Zola)
  sous la forme de deux listes:
  - une liste D des documents de la classe clazz,
  - une liste Q des couples (pk, v) des documents ayant quitté la sous-collection.

  Si v est absent:
  - D: liste INTEGRALE des documents de la sous-collection à l'instant t.
  - Q est vide.

  Si v est présent:
  - D: liste des documents ayant 'Zola' dans sa liste d'auteurs,
    - créés après v.
    - modifiés après v.
    - zombifiés après v.
  - Q: liste des couples (pk, v) des documents de clé pk,
    - ayant quitté la sous-collection postérieurement à v (possiblement par zombification).
  Il se peut que dans Q soient cités des documents ayant quitté la collection
  à t2 alors qu'ils inscrits comme présents à t3 dans D. Ils sont à ignorer (D l'emporte sur Q)

  isList: true si la propriété 'auteurs' est une liste.
  */
  getColl(org: string, clazz: string, 
    colName: string, col: string, isList: boolean, v: number) : Promise<[row[], pkv[]]>

  /* Sélectionne les documents et les transmet à la fonction de traitement
  Par organisation.
  fn reçoit en arguments (data) : data du row décrypté MAIS sérialisé
  */
  selectDocs(org: string, clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void>
  
  /* Sélectionne les documents et les transmet à la fonction de traitement
  Toutes organisations confondues.
  fn reçoit en arguments (org, data) : data du row décrypté MAIS sérialisé
  */
  selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void>

}