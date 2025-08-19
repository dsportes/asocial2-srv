/* Interface d'accès au Storage : extension spécifique de l'application */

import { IStGeneric } from '../src-fw/iStGeneric'

export interface IStApp extends IStGeneric {
  ping () : Promise<[number, string]> 
}
