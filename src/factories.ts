import { AuthToken, AuthRecord, Operation } from '../src-fw/operation'
import { Crypt, fromPem } from '../src-fw/crypt'
import { config } from '../src-fw/config'

export function factory (auth: AuthRecord, token: AuthToken) {
  switch (token.role) {
    case 'admin' : return new AdminVerify(auth, token)
    case 'manager' : return new ManagerVerify(auth, token)
  }
  return null
}

class Verify {
  op: Operation
  auth: AuthRecord
  token: AuthToken
  constructor (auth: AuthRecord, token: AuthToken) {
    this.op = auth.op
    this.auth = auth
    this.token = token
  }

  async check () : Promise<Object> {
    return null
  }

}

class AdminVerify extends Verify {

  constructor (auth: AuthRecord, token: AuthToken) { super(auth, token)}

  async check () : Promise<Object> {
    const pem = config.ADMINPEM
    const v = await this.auth.verify(pem, this.token)
    return v ? { status: 'OK' } : null
  }
}

class ManagerVerify extends Verify {

  constructor (auth: AuthRecord, token: AuthToken) { super(auth, token)}

  async check () : Promise<Object> {
    return null
  }
}