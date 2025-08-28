import { Operation, Authenticator } from '../src-fw/operation'

export function factory (name: string, arg: any) {
  switch (name) {
  case 'Authenticator' : return new AppAuthenticator(arg)
  }
}

export class AppAuthenticator extends Authenticator {

  constructor (op: Operation) {
    super(op)
  }
}