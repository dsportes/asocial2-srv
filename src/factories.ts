import { AuthToken, AuthRecord, Operation } from '../src-fw/operation'
// import { Crypt, fromPem } from '../src-fw/crypt'
import { config } from '../src-fw/config'
import { Credential } from '../src-fw/documents'

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

  async getCred () : Promise<Credential> {
    const src = { userId: this.auth.userId, role: this.token.role, entid: this.token.entid, hpems: this.token.hpems }
    return await this.op.cache.getDoc('Credential', src) as Credential
  }

}

class AdminVerify extends Verify {

  constructor (auth: AuthRecord, token: AuthToken) { super(auth, token)}

  async check () : Promise<Object> {
    if (!config.ADMINUSERS.has(this.auth.userId)) return null
    const pem = config.ADMINPEM
    const v = await this.auth.verify(pem, this.token)
    return v ? { status: true } : null
  }
}

class ManagerVerify extends Verify {

  constructor (auth: AuthRecord, token: AuthToken) { super(auth, token)}

  async check () : Promise<Object> {
    const cred = await this.getCred()
    if (!cred) return null
    const cond = cred.cond

    return null // info : { status: true ... }
  }
}