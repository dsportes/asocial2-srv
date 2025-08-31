import { DocPattern } from './document'
import { DbConnector } from './dbConnector'
import { Operation } from './operation'
import { DocSchema } from './doctypes'

/* Interface des services d'accès génériques à la DB */

export enum comparator { LT, LE, EQ, GE, GT, IN }

export interface IDbGeneric {
  connector: DbConnector
  op: Operation
  key: Buffer
  docSchema : DocSchema

  kiFromPattern (pname: string, data: DocPattern) : any
  idFromPattern (data: DocPattern) : string[]

  /* Connexion à la DB */
  connect () : Promise<void>

  /* Déconnexion de la DB */
  disconnect () : Promise<void>

  dataToRow (data: Object) : Object
  dataToZombiRow (data: Object) : Object
  rowToDataObj (row: Object) : Object 
  rowToDataBin (row: Object) : Uint8Array

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

  /* Documents, _fils_, 'Task' ******************************************/
  /* Lecture DU document: retourne le data sérialisé
  - pattern: { clazz, org, p1, p2, ... } : propriétés identifiantes
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  */
  getDoc (pattern: DocPattern, v?: number) : Promise<Uint8Array>

  /* Insertion d'un document représenté par son row
  - row : Objet row du document.
  */
  insertDoc (row: Object) : Promise<void>

  /* Mise à jour d'un document existant représenté par son row
  - row : Objet row du document.
  */
  updateDoc (row: Object) : Promise<void>

  /* Suppression (purge) du document identifié par org / cl / pk
  - pattern: { clazz, org, p1, p2, ... } : propriétés identifiantes
  Ne s'applique qu'aux documents NON SYNCHRONISABLE, les autres dont gérés par 
  passage en zombi puis purge d'un zombi, ou purge sur propriété de type 'dlv'
  */
  deleteDoc (pattern: DocPattern) : Promise<void>

  /* Retourne les data sérialisées de TOUS les documents d'une classe donnée.
  - pattern: { clazz, org }
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  - fn : si cette fonction est donnée elle reçoit en argument chaque data sérialisée
  et dans ce cas le retour est null.
  */
  listDocs (pattern: DocPattern, v?: number, fn? : Function) : Promise<Uint8Array[]>

  /* Retourne les data sérialisées de TOUS les documents d'une classe donnée,
  dont la clé secondaire ik a pour valeur val.
  - pattern: { clazz, org, p1, p2 ... } : propriétés identifiantes de ki
  - ik : index 1..N de la clé secondaire à utiliser.
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  - fn : si cette fonction est donnée elle reçoit en argument chaque data sérialisée
  et dans ce cas le retour est null.
  */
  listDocsSk (pattern: DocPattern, ik: number, v?: number, fn? : Function) : Promise<Uint8Array[]>

  /* Retourne les data sérialisées de TOUS les documents d'une classe donnée,
  dont la valeur de l'index ix a une compraison true avec val.
  - pattern: { clazz, org, pi } : propriété indexée de comparaison.
    Selon son type d'index:
    - hash : string. comp vaut 'EQ'
    - string / int / float : valeur de la propriété string / number / number
    - list : string[]. comp vaut 'IN'
  - ix : index 1..N de la clé secondaire à utiliser.
  - comp : 'LT' 'LE' 'EQ' 'GE' 'GT' 'IN'
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  - fn : si cette fonction est donnée elle reçoit en argument chaque data sérialisée
  et dans ce cas le retour est null.
  */
  listDocsIdx (pattern: DocPattern, ix: number, comp: comparator, v?: number, fn? : Function) : Promise<Uint8Array[]>

  /* Hdr ****************************************************************/
  /* Retourne la data sérialisée du singleton Hdr ou null si inexistant.
  */
  getHdr (v? : number) : Promise<Uint8Array>

  /* Insertion du document Hdr représenté par son row
  - row : Objet row du document.
  */
  insertHdr (row: Object) : Promise<void>

  /* Mise à jour du document Hdr existant représenté par son row
  - row : Objet row du document.
  */
  updateHdr (row: Object) : Promise<void>

  /* Org ****************************************************************/
  /* Retourne la data sérialisée du document de l'organisation.
  - org : code l'organisation.
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  */
  getOrg (org: string, v?: number) : Promise<Uint8Array>

  /* Insère une nouvelle organisation par son "row"
  */
  insertOrg (row: Object) : Promise<void>

  /* Met à jour une organisation existante par son "row"
  */
  updateOrg (row: Object) : Promise<void>

  /* Retourne les data sérialisées de toutes les organisations.
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  - fn : si cette fonction est donnée elle reçoit en argument chaque data sérialisée
  et dans ce cas le retour est null.
  */
  listOrgs (v?: number, fn? : Function) : Promise<Uint8Array[]>

  /* Retourne les data sérialisées des organisations,
  dont la valeur de l'index ix a une comparaison true avec val.
  - ix : index 1..N de la clé secondaire à utiliser.
  - comp : 'LT' 'LE' 'EQ' 'GE' 'GT' 'IN'
  - val : à comparer. Selon le type de l'index:
    - hash : string. comp vaut 'EQ'
    - string / int / float : valeur de la propriété string / number / number
    - list : string[]. comp vaut 'IN'
  - v : si présent et non 0, ne retourne le data que si sa version est supérieure à v.
  - fn : si cette fonction est donnée elle reçoit en argument chaque data sérialisée
  et dans ce cas le retour est null.
  */
  listOrgsIdx (ix: number, comp: comparator, val: any, v?: number, fn? : Function) : Promise<Uint8Array[]>

  /* Purges hors transaction *******************************************/
  /* TOOLS - purge tous les documents d'une classe donnée pour une organisation donnée.
  - pattern : { org, cl }
  */
  purgeAllDocs (pattern: DocPattern) : Promise<void>

  /* TOOLS - purge une organisation donnée.
  - org : code de l'organisation
  */
  purgeOrg (org: string, z?: number) : Promise<void>

  /* ADMIN - purge les organisations zombis.
  - org : code de l'organisation
  - z : ne purge que les documents dont le `z` est antérieure à z.
  */
  purgeOrgs (org: string, z: number) : Promise<void>

  /* ADMIN - purge les documents zombis ou contrôlés par un attribut de type 'dlv'.
  - pattern: { clazz, org, z OU pi } : z OU propriété indexée (valeur de comparaison).
    Selon son type d'index:
    - hash : string. comp vaut 'EQ'
    - string / int / float : valeur de la propriété string / number / number
    - list : string[]. comp vaut 'IN'
  - ix : index 1..N de l'index à utiliser. -1 par convention pour z
  - comp : 'LT' 'LE' 'GE' 'GT'
  - ??? lstp: liste des index des propriétés de type list de la classe du document.
  */
  purgeDlvDocs (pattern: DocPattern, ix: number, comp: comparator) : Promise<void>

  /* FTP : Files To Purge - HORS TRANSACTION ******************************/
  /* Déclaration d'un FTP
  - org : code de l'organisation
  - path: path sur le storage
  - dp: ne pas purger avant dp
  */
  setFTP (org: string, path: string, dp: number) : Promise<void>
 
  /* Purge d'un FTP
  - org : code de l'organisation
  - path: path sur le storage
  */
  purgeFTP (org: string, path: string) : Promise<void>

  /* Liste tous les FTP à purger pour purge sur storage
  - dp : jour de purge limite
  - fn : fonction recevant pour chaque FTP { org, path }
  */
  listFTP (dp : number, fn: Function) : Promise<void>

  /* Purge tous les FTP à purger 
  - dp : jour de purge limite
  */
  purgeAllFTP (dp : number) : Promise<void>

  /* Task *******************************************************/
  /* Retourne le data sérialisé de la prochaine tâche candidate à exécuter
  - time : ne considère que les tâches de startTime postérieures à time
  */
  nextTask (time: string) : Promise<Uint8Array>

}