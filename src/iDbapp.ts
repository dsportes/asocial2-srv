/* Interface d'accès à DB : extension spécifique de l'application */

import { IDbGeneric } from '../src-fw/iDbGeneric'

export interface IDbApp extends IDbGeneric {
  fakeForTest () : Promise<[number, string]> 
}

