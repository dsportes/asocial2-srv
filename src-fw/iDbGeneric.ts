/* Interface des services d'accès génériques à la DB */

export interface IDbGeneric {
  ping () : Promise<[number, string]> 
  doTransaction () : Promise<[number, string]> 
}