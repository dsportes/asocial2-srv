// import { BaseConfig } from '../src-fw/index'
import { Operation } from '../src-fw/operation'
import { InvitValidateA } from '../src-fw/operations'
import { Crypt, toPem } from '../src-fw/crypt'
import { config } from '../src-fw/config'
// import { DocStatus } from '../src-fw/document'
import { Credential } from '../src-fw/documents'

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

  /* _accept: Accept // NON nul si "accept" {
    role: string // rôle du credential associé (et classe du document associé).
    docId: string // `docId` du credential associé (et du document associé le cas échéant).
    cond: any // données à faire figurer en `cond` du credential.
    etc: any // autres données nécessaires pour créer le document associé. 
      // U n'a pas à connaître ni interpréter `etc` (_opaque_ pour lui)
      // ne sert qu'à l'opération de création de l'objet / enregistrement du credential.
  }
  */

  init () {
    super.init()
  }

  /* Enregistrement:
    - d'un document 'Auteur' 
      - docId: tiré de invit (généré par "accept")
      - nom: label saisi dans la demande invit.
    - d'un Credential sur cet auteur avec un pemV
      - issu de la génération du couple pemS et pemV 
  */
  async doIt_writer () {
    const { pub, priv } = await Crypt.getSVKeyPair()
    this.invit.etc.credPemS = priv
    this.invit.etc.credTime = this.now
    const cr = {
      id: '',
      userId: this.invit.userId,
      role: this.invit.role,
      org: this.org,
      docId: this.invit.docId,
      name: this.invit.label,
      time: this.now,
      pemv: toPem(pub, true),
      limit: 0,
      cond: null
    }
    cr.id = Credential.getId(config.SVC, cr)
    this.invit.etc.credTime = cr.id
    this.cache.newDoc('Auteur', { id: this.invit.docId, nom: this.invit.label })
    this.cache.newDoc('Credential', cr)
  }

  async doIt() {
    switch (this.invit.major) {
      case 'writer' : { await this.doIt_writer(); break }
    }
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
