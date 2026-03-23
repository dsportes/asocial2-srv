// import { BaseConfig } from '../src-fw/index'
import { Operation } from '../src-fw/operation'
import { InvitValidateA } from '../src-fw/operations'
import { DocStatus } from '../src-fw/document'
import { Invitation } from '../src-fw/documents'

export function register () {
  return Operation.nbOf()
}

/* InvitValidate (réelle) marque le status d'une invitation en status 4 (acceptée). 
Le demandeur doit être l'utilisateur.
Le traitement conduit à une importante logique spécifique:
- création éventuelle d'un ou plusieurs documents "de position" (compte, abonné, employé ...)
- enregistrement d'un ou plusieurs credentials.
Tout ceci s'effectue depuis les données role / docId / cond / etc du document invitation.
Côté application, les credentials sont à enregistrer en Safe et des subscriptions
sont à gérer sur le / les documents de "position".
*/
class InvitValidate extends InvitValidateA {
  constructor () { super() }

  init () {
    super.init()
  }

  async doIt() {

  }

  async phase2 () {
    await super.phase2()
    /*
    let s = 0
    this.requireAuth()
    // const sp = this.authRecord.userId
    this.invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!this.invit) s = 1
    else {
      if (this.invit.userId !== this.authRecord.userId) s = 2
      else if (this.invit.status !== 2) s = 3
      else {
        // Do the job: logique spécifique de l'application
        await this.doIt()
        this.invit.status = 4
        this.invit._status = DocStatus.UPD
      }
    }
    this.setRes('status', s)
    */
  }

  phase3 : null
}
Operation.register('InvitValidate', () => { return new InvitValidate()})
