import { Operation, AuthRecord } from '../src-fw/operation'

export function factory (name: string, arg: any) {
  switch (name) {
  case 'AuthRecord' : return new AppAuthRecord(arg)
  }
}

export class AppAuthRecord extends AuthRecord {

  constructor (op: Operation) { super(op) }

  async mtTEST1 (token: Object) {
    if (token['toto'] === 'titi') this.auths.add('TOTO')
  }
}