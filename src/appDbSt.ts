import { DbGeneric } from '../src-dbst/dbConnector'
import { StGeneric } from '../src-dbst/stConnector'

export interface DbApp extends DbGeneric {
  ping () : Promise<[number, string]> 
}

export interface StApp extends StGeneric {
  ping () : Promise<[number, string]> 
}
