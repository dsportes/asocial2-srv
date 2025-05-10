import { DbGeneric } from '../src-fw/dbConnector'
import { StGeneric } from '../src-fw/stConnector'

export interface DbApp extends DbGeneric {
  ping () : Promise<[number, string]> 
}

export interface StApp extends StGeneric {
  ping () : Promise<[number, string]> 
}
