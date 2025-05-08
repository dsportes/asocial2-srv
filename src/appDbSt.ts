import { DbGeneric, StGeneric } from '../src-dbst/index'

export interface DbApp extends DbGeneric {
  ping () : Promise<[number, string]> 
}

export interface StApp extends StGeneric {
  ping () : Promise<[number, string]> 
}
